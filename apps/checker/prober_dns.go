package main

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"
)

// probeDNS resolves the monitor's host across A/AAAA/CNAME/MX/NS/TXT record
// sets and runs the configured `dnsRecord` assertions. Mirrors openstatus's
// `apps/checker/checker/dns.go` shape; stays stdlib-only by leaning on
// `net.DefaultResolver`.
//
// Reduction rules:
//   - resolution itself fails → status="down"
//   - resolution succeeds + any assertion fails → status="down"
//   - resolution succeeds + all assertions pass + latency > degradedAfterMs → "degraded"
//   - else → "up"
func probeDNS(ctx context.Context, m Monitor, defaultTimeout time.Duration) ProbeOutcome {
	timeout := defaultTimeout
	if m.TimeoutMs > 0 {
		timeout = time.Duration(m.TimeoutMs) * time.Millisecond
	}
	probeCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	if m.Host == "" {
		errMsg := "dns monitor missing host"
		return ProbeOutcome{Status: "down", Error: &errMsg}
	}

	start := time.Now()
	probe, err := resolveAll(probeCtx, m.Host)
	latency := int(time.Since(start).Milliseconds())

	if err != nil {
		errMsg := truncate(err.Error(), 500)
		return ProbeOutcome{
			Status:    "down",
			LatencyMs: &latency,
			Error:     &errMsg,
		}
	}

	out := ProbeOutcome{
		LatencyMs: &latency,
		// DNS lookup time goes in the dns phase column for the chart.
		LatencyDnsMs: &latency,
	}

	ok, msg := evaluateDNSAssertions(m.Assertions, probe)
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

// resolveAll fans out the supported lookups in parallel. Each lookup that
// errors out individually is treated as "no records of that type" rather than
// failing the whole probe — common cases like a hostname with no MX records
// shouldn't flag the monitor as down. Resolution as a whole only fails when
// the IP lookup itself fails.
func resolveAll(ctx context.Context, host string) (dnsProbe, error) {
	resolver := net.DefaultResolver

	ips, err := resolver.LookupIPAddr(ctx, host)
	if err != nil {
		return dnsProbe{}, fmt.Errorf("lookup %s: %w", host, err)
	}

	var p dnsProbe
	for _, ip := range ips {
		if v4 := ip.IP.To4(); v4 != nil {
			p.A = append(p.A, v4.String())
		} else {
			p.AAAA = append(p.AAAA, ip.IP.String())
		}
	}

	if cname, err := resolver.LookupCNAME(ctx, host); err == nil && cname != "" {
		// LookupCNAME returns a trailing dot per the DNS wire format; strip
		// it so user-provided assertions like "eq example.com" work without
		// the user having to know about the trailing dot.
		p.CNAME = []string{strings.TrimSuffix(cname, ".")}
	}
	if mx, err := resolver.LookupMX(ctx, host); err == nil {
		for _, r := range mx {
			p.MX = append(p.MX, fmt.Sprintf("%s:%d", strings.TrimSuffix(r.Host, "."), r.Pref))
		}
	}
	if ns, err := resolver.LookupNS(ctx, host); err == nil {
		for _, r := range ns {
			p.NS = append(p.NS, strings.TrimSuffix(r.Host, "."))
		}
	}
	if txt, err := resolver.LookupTXT(ctx, host); err == nil {
		p.TXT = append(p.TXT, txt...)
	}
	return p, nil
}
