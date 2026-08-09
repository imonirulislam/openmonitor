package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"sync"
	"time"
)

// trackedMonitor stores enough state to detect when a monitor's config has
// changed and the goroutine needs to be restarted with the new config.
type trackedMonitor struct {
	cancel     context.CancelFunc
	configHash string
}

type Runner struct {
	cfg     Config
	api     *APIClient
	mu      sync.Mutex
	tracked map[string]*trackedMonitor
}

func NewRunner(cfg Config) *Runner {
	return &Runner{
		cfg:     cfg,
		api:     NewAPIClient(cfg.APIBaseURL, cfg.APIKey),
		tracked: make(map[string]*trackedMonitor),
	}
}

func (r *Runner) Run(ctx context.Context) {
	tick := time.NewTicker(r.cfg.RefreshEvery)
	defer tick.Stop()

	// Subscribe to pg_notify if DATABASE_URL is set so config changes are
	// picked up immediately instead of waiting for the next tick.
	changes := make(chan string, 16)
	go listen(ctx, r.cfg.DatabaseURL, changes)

	// First refresh jitters initial probes to avoid dogpiling on cold start.
	// Subsequent refreshes (periodic tick or pg_notify) only call start() for
	// genuinely new or config-changed monitors, which should probe immediately.
	r.refresh(ctx, true)

	for {
		select {
		case <-ctx.Done():
			r.stopAll()
			return
		case <-tick.C:
			r.refresh(ctx, false)
		case payload := <-changes:
			log.Printf("listener: monitor_changed payload=%q, refreshing", payload)
			r.refresh(ctx, false)
		}
	}
}

func (r *Runner) refresh(ctx context.Context, jitter bool) {
	monitors, err := r.api.ListMonitors(ctx)
	if err != nil {
		log.Printf("failed to list monitors: %v", err)
		return
	}

	seen := make(map[string]bool, len(monitors))
	for _, m := range monitors {
		seen[m.ID] = true
		hash := configHash(m)

		r.mu.Lock()
		existing, running := r.tracked[m.ID]
		r.mu.Unlock()

		if running && existing.configHash == hash {
			continue // unchanged
		}
		if running {
			// Config changed — cancel old goroutine, then restart.
			existing.cancel()
			r.mu.Lock()
			delete(r.tracked, m.ID)
			r.mu.Unlock()
			log.Printf("restarting monitor %s (config changed)", m.Slug)
		}
		r.start(ctx, m, hash, jitter)
	}

	// Stop probes for monitors that disappeared.
	r.mu.Lock()
	for id, t := range r.tracked {
		if !seen[id] {
			t.cancel()
			delete(r.tracked, id)
			log.Printf("stopped monitor %s (no longer in list)", id)
		}
	}
	r.mu.Unlock()
}

func (r *Runner) start(parent context.Context, m Monitor, hash string, jitter bool) {
	ctx, cancel := context.WithCancel(parent)
	r.mu.Lock()
	r.tracked[m.ID] = &trackedMonitor{cancel: cancel, configHash: hash}
	r.mu.Unlock()

	interval := max(time.Duration(m.IntervalSeconds)*time.Second, 10*time.Second)

	log.Printf("starting monitor %s (%s) every %s", m.Slug, m.URL, interval)

	go func() {
		if jitter {
			// On cold start, stagger initial probes so all monitors don't fire
			// at the same instant. For runtime adds/edits we skip this and
			// probe immediately.
			time.Sleep(time.Duration(time.Now().UnixNano()%int64(interval)) % interval)
		}
		r.runOne(ctx, m)
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				r.runOne(ctx, m)
			}
		}
	}()
}

func (r *Runner) runOne(ctx context.Context, m Monitor) {
	// Initial attempt + up to RetryCount retries. We only post the FINAL
	// result so transient retried failures don't show up as spurious "down"
	// rows in the logs / events stream. Each attempt respects the per-monitor
	// timeout. Between attempts we wait RetryDelaySeconds (default 5s).
	out := dispatchProbe(ctx, m, r.cfg.DefaultTimeout)
	for attempt := 1; attempt <= m.RetryCount; attempt++ {
		if out.Status == "up" {
			break
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Duration(max(m.RetryDelaySeconds, 1)) * time.Second):
		}
		log.Printf("retry %d/%d for monitor %s", attempt, m.RetryCount, m.Slug)
		out = dispatchProbe(ctx, m, r.cfg.DefaultTimeout)
	}
	checkedAt := time.Now().UTC().Format(time.RFC3339)
	if err := r.api.PostResult(ctx, ProbeResult{
		MonitorID:         m.ID,
		Status:            out.Status,
		StatusCode:        out.StatusCode,
		LatencyMs:         out.LatencyMs,
		LatencyDnsMs:      out.LatencyDnsMs,
		LatencyConnectMs:  out.LatencyConnectMs,
		LatencyTlsMs:      out.LatencyTlsMs,
		LatencyTtfbMs:     out.LatencyTtfbMs,
		LatencyTransferMs: out.LatencyTransferMs,
		Region:            r.cfg.Region,
		Error:             out.Error,
		CheckedAt:         checkedAt,
	}); err != nil {
		log.Printf("post result %s: %v", m.Slug, err)
	}
}

func (r *Runner) stopAll() {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, t := range r.tracked {
		t.cancel()
	}
	r.tracked = map[string]*trackedMonitor{}
}

// configHash captures everything that affects probe behavior. If any of these
// change, we need to restart the goroutine so it picks up the new config.
func configHash(m Monitor) string {
	body := ""
	if m.Body != nil {
		body = *m.Body
	}
	payload := struct {
		Kind              string          `json:"kind"`
		URL               string          `json:"url"`
		Method            string          `json:"method"`
		Host              string          `json:"host"`
		Port              int             `json:"port"`
		Headers           []HeaderEntry   `json:"headers"`
		Body              string          `json:"body"`
		Assertions        json.RawMessage `json:"assertions"`
		DegradedAfterMs   int             `json:"degradedAfterMs"`
		FollowRedirects   bool            `json:"followRedirects"`
		IntervalSeconds   int             `json:"intervalSeconds"`
		TimeoutMs         int             `json:"timeoutMs"`
		RetryCount        int             `json:"retryCount"`
		RetryDelaySeconds int             `json:"retryDelaySeconds"`
	}{
		m.Kind, m.URL, m.Method, m.Host, m.Port,
		m.Headers, body, m.Assertions, m.DegradedAfterMs, m.FollowRedirects,
		m.IntervalSeconds, m.TimeoutMs, m.RetryCount, m.RetryDelaySeconds,
	}
	buf, _ := json.Marshal(payload)
	sum := sha256.Sum256(buf)
	return hex.EncodeToString(sum[:8])
}
