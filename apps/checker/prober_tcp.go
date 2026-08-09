package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"
)

// probeTCP dials a TCP socket against m.Host:m.Port and reports the dial
// latency. No assertions — TCP monitors only check that the port accepts a
// connection. Mirrors openstatus's `apps/checker/checker/tcp.go`.
//
// Latency-based degradation still applies: if dial succeeds within
// DegradedAfterMs we return "up", else "degraded".
func probeTCP(ctx context.Context, m Monitor, defaultTimeout time.Duration) ProbeOutcome {
	timeout := defaultTimeout
	if m.TimeoutMs > 0 {
		timeout = time.Duration(m.TimeoutMs) * time.Millisecond
	}

	if m.Host == "" || m.Port == 0 {
		errMsg := "tcp monitor missing host or port"
		return ProbeOutcome{Status: "down", Error: &errMsg}
	}
	addr := net.JoinHostPort(m.Host, strconv.Itoa(m.Port))

	dialer := net.Dialer{Timeout: timeout}
	start := time.Now()
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	latency := int(time.Since(start).Milliseconds())

	if err != nil {
		errMsg := truncate(tcpErrorMessage(err, latency), 500)
		return ProbeOutcome{
			Status:    "down",
			LatencyMs: &latency,
			Error:     &errMsg,
		}
	}
	defer conn.Close()

	out := ProbeOutcome{
		LatencyMs: &latency,
		// Reuse the connect phase so the per-phase chart shows where the time
		// went. DNS/TLS/TTFB/Transfer don't apply for raw TCP.
		LatencyConnectMs: &latency,
	}
	if m.DegradedAfterMs > 0 && latency > m.DegradedAfterMs {
		out.Status = "degraded"
		return out
	}
	out.Status = "up"
	return out
}

// tcpErrorMessage matches openstatus's friendlier classification (timeout vs
// refused vs other) so users get actionable error rows.
func tcpErrorMessage(err error, latencyMs int) string {
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return fmt.Sprintf("timeout after %d ms", latencyMs)
	}
	if strings.Contains(err.Error(), "connection refused") {
		return "connection refused"
	}
	return err.Error()
}
