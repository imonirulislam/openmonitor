package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type HeaderEntry struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// Monitor mirrors the row shape returned by `GET /v1/probes/monitors`.
// `Kind` drives per-kind dispatch (http / tcp / dns); `Assertions` drives the
// reduction (any failure → down, all pass + latency > DegradedAfterMs →
// degraded, else up).
type Monitor struct {
	ID                string          `json:"id"`
	Slug              string          `json:"slug"`
	Name              string          `json:"name"`
	Kind              string          `json:"kind"`
	URL               string          `json:"url"`
	Method            string          `json:"method"`
	Host              string          `json:"host"`
	Port              int             `json:"port"`
	Headers           []HeaderEntry   `json:"headers"`
	Body              *string         `json:"body"`
	Assertions        json.RawMessage `json:"assertions"`
	DegradedAfterMs   int             `json:"degradedAfterMs"`
	FollowRedirects   bool            `json:"followRedirects"`
	IntervalSeconds   int             `json:"intervalSeconds"`
	TimeoutMs         int             `json:"timeoutMs"`
	RetryCount        int             `json:"retryCount"`
	RetryDelaySeconds int             `json:"retryDelaySeconds"`
}

type ProbeResult struct {
	MonitorID         string  `json:"monitorId"`
	Status            string  `json:"status"`
	StatusCode        *int    `json:"statusCode"`
	LatencyMs         *int    `json:"latencyMs"`
	LatencyDnsMs      *int    `json:"latencyDnsMs,omitempty"`
	LatencyConnectMs  *int    `json:"latencyConnectMs,omitempty"`
	LatencyTlsMs      *int    `json:"latencyTlsMs,omitempty"`
	LatencyTtfbMs     *int    `json:"latencyTtfbMs,omitempty"`
	LatencyTransferMs *int    `json:"latencyTransferMs,omitempty"`
	Error             *string `json:"error"`
	CheckedAt         string  `json:"checkedAt"`
}

type APIClient struct {
	baseURL  string
	apiToken string
	http     *http.Client
}

func NewAPIClient(baseURL, apiToken string) *APIClient {
	return &APIClient{
		baseURL:  baseURL,
		apiToken: apiToken,
		http: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *APIClient) ListMonitors(ctx context.Context) ([]Monitor, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/v1/probes/monitors", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiToken)

	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != 200 {
		body, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("list monitors: %d %s", res.StatusCode, body)
	}

	var payload struct {
		Monitors []Monitor `json:"monitors"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, err
	}
	return payload.Monitors, nil
}

func (c *APIClient) PostResult(ctx context.Context, r ProbeResult) error {
	buf, err := json.Marshal(r)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(
		ctx, "POST", c.baseURL+"/v1/probes/results", bytes.NewReader(buf),
	)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiToken)
	req.Header.Set("Content-Type", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode >= 300 {
		body, _ := io.ReadAll(res.Body)
		return fmt.Errorf("post result: %d %s", res.StatusCode, body)
	}
	return nil
}
