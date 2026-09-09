package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"io"
	"net/http"
	"net/http/httptrace"
	"strings"
	"time"
)

// Cap on response body bytes read for body assertions. 1 MB is generous for
// status-page-style endpoints; anything larger and assertions still see
// the prefix.
const maxAssertionBodyBytes = 1 << 20

// dispatchProbe routes a monitor to the appropriate per-kind prober. Empty
// kinds default to HTTP for back-compat with rows written before monitor kinds
// were introduced.
func dispatchProbe(ctx context.Context, m Monitor, defaultTimeout time.Duration) ProbeOutcome {
	switch m.Kind {
	case "tcp":
		return probeTCP(ctx, m, defaultTimeout)
	case "dns":
		return probeDNS(ctx, m, defaultTimeout)
	case "http", "":
		return probe(ctx, m, defaultTimeout)
	}
	errMsg := "unknown monitor kind: " + m.Kind
	return ProbeOutcome{Status: "down", Error: &errMsg}
}

// ProbeOutcome carries the per-probe result back up to the runner. The
// per-phase latency fields are populated when `httptrace` events fire — they
// can be nil when a phase didn't apply (e.g., TLS on plain HTTP, or DNS when
// the address was reused from cache).
type ProbeOutcome struct {
	Status            string
	StatusCode        *int
	LatencyMs         *int
	Error             *string
	LatencyDnsMs      *int
	LatencyConnectMs  *int
	LatencyTlsMs      *int
	LatencyTtfbMs     *int
	LatencyTransferMs *int
}

func probe(ctx context.Context, m Monitor, defaultTimeout time.Duration) ProbeOutcome {
	timeout := defaultTimeout
	if m.TimeoutMs > 0 {
		timeout = time.Duration(m.TimeoutMs) * time.Millisecond
	}

	probeCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	method := m.Method
	if method == "" {
		method = "GET"
	}

	var body *bytes.Reader
	if m.Body != nil {
		body = bytes.NewReader([]byte(*m.Body))
	}

	// httptrace timestamps. Each event fires zero or one time per request;
	// we record the moment it happened and convert to durations once the
	// request completes.
	var (
		dnsStart, dnsDone         time.Time
		connectStart, connectDone time.Time
		tlsStart, tlsDone         time.Time
		firstByte                 time.Time
	)
	trace := &httptrace.ClientTrace{
		DNSStart:             func(httptrace.DNSStartInfo) { dnsStart = time.Now() },
		DNSDone:              func(httptrace.DNSDoneInfo) { dnsDone = time.Now() },
		ConnectStart:         func(_, _ string) { connectStart = time.Now() },
		ConnectDone:          func(_, _ string, _ error) { connectDone = time.Now() },
		TLSHandshakeStart:    func() { tlsStart = time.Now() },
		TLSHandshakeDone:     func(tls.ConnectionState, error) { tlsDone = time.Now() },
		GotFirstResponseByte: func() { firstByte = time.Now() },
	}
	probeCtx = httptrace.WithClientTrace(probeCtx, trace)

	var req *http.Request
	var err error
	if body != nil {
		req, err = http.NewRequestWithContext(probeCtx, method, m.URL, body)
	} else {
		req, err = http.NewRequestWithContext(probeCtx, method, m.URL, nil)
	}
	if err != nil {
		errMsg := err.Error()
		return ProbeOutcome{Status: "down", Error: &errMsg}
	}
	for _, h := range m.Headers {
		if h.Key == "" {
			continue
		}
		req.Header.Set(h.Key, h.Value)
	}
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", "openmonitor-checker/0.1")
	}

	// Every probe gets a fresh connection. http.DefaultTransport pools them,
	// so after the first probe to a host the DNS, TCP and TLS work never
	// happens again — those httptrace events stop firing and the phase
	// breakdown collapses to TTFB alone. A monitor is supposed to measure the
	// full connect path each time, not a warm socket.
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DisableKeepAlives = true
	client := &http.Client{Timeout: timeout, Transport: transport}
	defer client.CloseIdleConnections()
	// Honor follow_redirects from the monitor config. Default Go behavior is to
	// follow up to 10 redirects; opt out by returning ErrUseLastResponse.
	if !m.FollowRedirects {
		client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		}
	}
	start := time.Now()
	res, err := client.Do(req)
	end := time.Now()
	latency := int(end.Sub(start).Milliseconds())

	phases := computePhases(start, dnsStart, dnsDone, connectStart, connectDone, tlsStart, tlsDone, firstByte, end)

	if err != nil {
		errMsg := truncate(err.Error(), 500)
		return ProbeOutcome{
			Status:            "down",
			LatencyMs:         &latency,
			Error:             &errMsg,
			LatencyDnsMs:      phases.dns,
			LatencyConnectMs:  phases.connect,
			LatencyTlsMs:      phases.tls,
			LatencyTtfbMs:     phases.ttfb,
			LatencyTransferMs: phases.transfer,
		}
	}
	defer res.Body.Close()

	statusCode := res.StatusCode

	// Read body only when at least one body assertion is configured. Skipping
	// the read otherwise keeps memory + bandwidth low for high-frequency
	// monitors.
	var bodyStr string
	if hasBodyAssertion(m.Assertions) {
		buf, readErr := io.ReadAll(io.LimitReader(res.Body, maxAssertionBodyBytes))
		if readErr != nil && readErr != io.EOF {
			errMsg := truncate("body read: "+readErr.Error(), 500)
			return ProbeOutcome{
				Status:            "down",
				LatencyMs:         &latency,
				StatusCode:        &statusCode,
				Error:             &errMsg,
				LatencyDnsMs:      phases.dns,
				LatencyConnectMs:  phases.connect,
				LatencyTlsMs:      phases.tls,
				LatencyTtfbMs:     phases.ttfb,
				LatencyTransferMs: phases.transfer,
			}
		}
		bodyStr = string(buf)
	}

	out := ProbeOutcome{
		StatusCode:        &statusCode,
		LatencyMs:         &latency,
		LatencyDnsMs:      phases.dns,
		LatencyConnectMs:  phases.connect,
		LatencyTlsMs:      phases.tls,
		LatencyTtfbMs:     phases.ttfb,
		LatencyTransferMs: phases.transfer,
	}

	// Assertion reduction (mirrors openstatus's `HTTPCheckerHandler`):
	//   any assertion fails → down
	//   all pass + degradedAfterMs > 0 + latency > degradedAfterMs → degraded
	//   else → up
	ok, msg := evaluateHTTPAssertions(m.Assertions, httpProbe{
		statusCode: statusCode,
		headers:    res.Header,
		body:       bodyStr,
	})
	if !ok {
		errMsg := truncate(msg, 500)
		out.Status = "down"
		out.Error = &errMsg
		return out
	}
	if m.DegradedAfterMs > 0 && latency > m.DegradedAfterMs {
		out.Status = "degraded"
		return out
	}
	out.Status = "up"
	return out
}

type phaseDurations struct {
	dns, connect, tls, ttfb, transfer *int
}

// computePhases turns the raw timestamps captured by httptrace into per-phase
// millisecond durations. Phases that didn't fire return nil rather than 0 so
// the chart can distinguish "didn't apply" (e.g., TLS on plain HTTP, or
// connection reused from the pool) from "0 ms — really fast."
func computePhases(
	start, dnsStart, dnsDone, connectStart, connectDone, tlsStart, tlsDone, firstByte, end time.Time,
) phaseDurations {
	var p phaseDurations
	if !dnsStart.IsZero() && !dnsDone.IsZero() {
		ms := int(dnsDone.Sub(dnsStart).Milliseconds())
		p.dns = &ms
	}
	if !connectStart.IsZero() && !connectDone.IsZero() {
		ms := int(connectDone.Sub(connectStart).Milliseconds())
		p.connect = &ms
	}
	if !tlsStart.IsZero() && !tlsDone.IsZero() {
		ms := int(tlsDone.Sub(tlsStart).Milliseconds())
		p.tls = &ms
	}
	// TTFB is anchored to the latest of (TLS done, Connect done, request
	// start). Connection-reuse paths skip ConnectDone, so we fall through.
	var ttfbAnchor time.Time
	switch {
	case !tlsDone.IsZero():
		ttfbAnchor = tlsDone
	case !connectDone.IsZero():
		ttfbAnchor = connectDone
	default:
		ttfbAnchor = start
	}
	if !firstByte.IsZero() && !ttfbAnchor.IsZero() && firstByte.After(ttfbAnchor) {
		ms := int(firstByte.Sub(ttfbAnchor).Milliseconds())
		p.ttfb = &ms
	}
	if !firstByte.IsZero() && !end.IsZero() && end.After(firstByte) {
		ms := int(end.Sub(firstByte).Milliseconds())
		p.transfer = &ms
	}
	return p
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return strings.ToValidUTF8(s[:n], "")
}
