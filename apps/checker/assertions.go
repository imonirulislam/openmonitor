package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strings"
)

// Mirrors packages/db/src/assertions.ts. Keep operator names in sync — the
// canonical source of truth lives there.
const (
	assertionStatus    = "status"
	assertionHeader    = "header"
	assertionTextBody  = "textBody"
	assertionJsonBody  = "jsonBody"
	assertionDnsRecord = "dnsRecord"
)

const (
	cmpEq       = "eq"
	cmpNotEq    = "not_eq"
	cmpGt       = "gt"
	cmpGte      = "gte"
	cmpLt       = "lt"
	cmpLte      = "lte"
	cmpContains = "contains"
	cmpNotCont  = "not_contains"
	cmpEmpty    = "empty"
	cmpNotEmpty = "not_empty"
)

// rawAssertion is the loose shape of every assertion row in the JSONB array.
// Per-type fields (key, path, target type) are decoded on demand inside each
// evaluator branch.
type rawAssertion struct {
	Type    string          `json:"type"`
	Compare string          `json:"compare"`
	Key     string          `json:"key,omitempty"`
	Path    string          `json:"path,omitempty"`
	Target  json.RawMessage `json:"target"`
	Version string          `json:"version,omitempty"`
}

// httpProbe carries everything an HTTP assertion needs to evaluate. body may
// be empty when no body assertion is configured (we skip the read in that
// case to keep the network footprint low).
type httpProbe struct {
	statusCode int
	headers    http.Header
	body       string
}

// dnsProbe carries the resolved record sets for DNS assertions.
type dnsProbe struct {
	A     []string
	AAAA  []string
	CNAME []string
	MX    []string
	NS    []string
	TXT   []string
}

// evaluateHTTPAssertions runs the reduction described in
// _reference/openstatus/apps/checker/handlers/checker.go: any failed
// assertion fails the probe; an empty list falls back to the "is 2xx?"
// rule so existing checker behavior is preserved when no assertions are
// configured. Returns (allPassed, firstFailureMessage).
func evaluateHTTPAssertions(raw json.RawMessage, p httpProbe) (bool, string) {
	assertions, err := decodeAssertions(raw)
	if err != nil {
		return false, err.Error()
	}
	if len(assertions) == 0 {
		// No assertions configured — accept any 2xx response.
		ok := p.statusCode >= 200 && p.statusCode < 300
		if ok {
			return true, ""
		}
		return false, fmt.Sprintf("status %d not in 2xx", p.statusCode)
	}
	for _, a := range assertions {
		ok, msg := evaluateOneHTTP(a, p)
		if !ok {
			return false, msg
		}
	}
	return true, ""
}

// evaluateDNSAssertions runs `dnsRecord` assertions against a resolved record
// set. Non-dnsRecord types are skipped (server-side validation should already
// reject those for DNS monitors).
func evaluateDNSAssertions(raw json.RawMessage, p dnsProbe) (bool, string) {
	assertions, err := decodeAssertions(raw)
	if err != nil {
		return false, err.Error()
	}
	if len(assertions) == 0 {
		// No assertions — DNS monitor is OK as long as resolution succeeded.
		return true, ""
	}
	for _, a := range assertions {
		if a.Type != assertionDnsRecord {
			continue
		}
		records := dnsRecordsForKey(p, a.Key)
		target, err := decodeStringTarget(a.Target)
		if err != nil {
			return false, fmt.Sprintf("dns assertion target: %v", err)
		}
		if !evaluateRecord(records, a.Compare, target) {
			return false, fmt.Sprintf("DNS %s: expected %s %q, got %v", a.Key, compareLabel(a.Compare), target, records)
		}
	}
	return true, ""
}

func decodeAssertions(raw json.RawMessage) ([]rawAssertion, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var out []rawAssertion
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("decode assertions: %w", err)
	}
	return out, nil
}

func evaluateOneHTTP(a rawAssertion, p httpProbe) (bool, string) {
	switch a.Type {
	case assertionStatus:
		target, err := decodeIntTarget(a.Target)
		if err != nil {
			return false, fmt.Sprintf("status assertion target: %v", err)
		}
		if !evaluateNumber(int64(p.statusCode), a.Compare, target) {
			return false, fmt.Sprintf("status %d %s %d failed", p.statusCode, compareLabel(a.Compare), target)
		}
	case assertionHeader:
		if a.Key == "" {
			return false, "header assertion: missing key"
		}
		target, err := decodeStringTarget(a.Target)
		if err != nil {
			return false, fmt.Sprintf("header assertion target: %v", err)
		}
		got := p.headers.Get(a.Key)
		if !evaluateString(got, a.Compare, target) {
			return false, fmt.Sprintf("header %q: expected %s %q, got %q", a.Key, compareLabel(a.Compare), target, got)
		}
	case assertionTextBody:
		target, err := decodeStringTarget(a.Target)
		if err != nil {
			return false, fmt.Sprintf("body assertion target: %v", err)
		}
		if !evaluateString(p.body, a.Compare, target) {
			return false, fmt.Sprintf("body: expected %s %q", compareLabel(a.Compare), target)
		}
	case assertionJsonBody:
		// JSONPath evaluation is deferred (see docs/plans/monitor-kinds-and-assertions.md
		// open question 3). For now jsonBody assertions always fail loudly so the
		// admin UI doesn't silently let a configured assertion be skipped.
		return false, "jsonBody assertions are not yet supported"
	default:
		return false, fmt.Sprintf("unknown assertion type %q", a.Type)
	}
	return true, ""
}

func evaluateNumber(value int64, op string, target int64) bool {
	switch op {
	case cmpEq:
		return value == target
	case cmpNotEq:
		return value != target
	case cmpGt:
		return value > target
	case cmpGte:
		return value >= target
	case cmpLt:
		return value < target
	case cmpLte:
		return value <= target
	}
	return false
}

func evaluateString(value, op, target string) bool {
	switch op {
	case cmpContains:
		return strings.Contains(value, target)
	case cmpNotCont:
		return !strings.Contains(value, target)
	case cmpEmpty:
		return value == ""
	case cmpNotEmpty:
		return value != ""
	case cmpEq:
		return value == target
	case cmpNotEq:
		return value != target
	case cmpGt:
		return value > target
	case cmpGte:
		return value >= target
	case cmpLt:
		return value < target
	case cmpLte:
		return value <= target
	}
	return false
}

func evaluateRecord(values []string, op, target string) bool {
	switch op {
	case cmpEq:
		return slices.Contains(values, target)
	case cmpNotEq:
		return !slices.Contains(values, target)
	case cmpContains:
		for _, v := range values {
			if strings.Contains(v, target) {
				return true
			}
		}
		return false
	case cmpNotCont:
		for _, v := range values {
			if strings.Contains(v, target) {
				return false
			}
		}
		return true
	}
	return false
}

func dnsRecordsForKey(p dnsProbe, key string) []string {
	switch key {
	case "A":
		return p.A
	case "AAAA":
		return p.AAAA
	case "CNAME":
		return p.CNAME
	case "MX":
		return p.MX
	case "NS":
		return p.NS
	case "TXT":
		return p.TXT
	}
	return nil
}

// hasBodyAssertion returns true when at least one assertion needs the response
// body. Used to skip the body read otherwise.
func hasBodyAssertion(raw json.RawMessage) bool {
	assertions, _ := decodeAssertions(raw)
	for _, a := range assertions {
		if a.Type == assertionTextBody || a.Type == assertionJsonBody {
			return true
		}
	}
	return false
}

func decodeIntTarget(raw json.RawMessage) (int64, error) {
	if len(raw) == 0 {
		return 0, fmt.Errorf("empty target")
	}
	// Accept both numeric and string-numeric to be lenient with form payloads.
	var n int64
	if err := json.Unmarshal(raw, &n); err == nil {
		return n, nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		var parsed int64
		if _, err := fmt.Sscanf(s, "%d", &parsed); err == nil {
			return parsed, nil
		}
	}
	return 0, fmt.Errorf("target is not a number: %s", raw)
}

func decodeStringTarget(raw json.RawMessage) (string, error) {
	if len(raw) == 0 {
		return "", nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s, nil
	}
	// Tolerate numeric targets stored as numbers — coerce to string.
	var n json.Number
	if err := json.Unmarshal(raw, &n); err == nil {
		return n.String(), nil
	}
	return "", fmt.Errorf("target is not a string: %s", raw)
}

func compareLabel(op string) string {
	switch op {
	case cmpEq:
		return "=="
	case cmpNotEq:
		return "!="
	case cmpGt:
		return ">"
	case cmpGte:
		return ">="
	case cmpLt:
		return "<"
	case cmpLte:
		return "<="
	case cmpContains:
		return "contains"
	case cmpNotCont:
		return "not contains"
	case cmpEmpty:
		return "empty"
	case cmpNotEmpty:
		return "not empty"
	}
	return op
}
