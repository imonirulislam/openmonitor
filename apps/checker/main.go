// OpenMonitor status checker.
//
// Polls the API for the list of enabled monitors, runs HTTP probes on a per-monitor
// schedule, and posts results back to the API. Stateless — safe to run multiple replicas;
// the API handles state and event emission.
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

func main() {
	flag.Parse()

	cfg := Config{
		APIBaseURL:     envOr("API_URL", "http://localhost:5002"),
		APIToken:       os.Getenv("PROBE_TOKEN"),
		RefreshEvery:   parseDurationEnv("CHECKER_REFRESH_INTERVAL", 30*time.Second),
		DefaultTimeout: parseDurationEnv("CHECKER_DEFAULT_TIMEOUT_MS", 10*time.Second),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
	}
	if cfg.APIToken == "" {
		log.Fatal("PROBE_TOKEN must be set")
	}

	// The region is a property of the token, resolved server-side, so the
	// checker no longer knows or asserts where it is running.
	log.Printf("checker starting api=%s", cfg.APIBaseURL)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		s := <-sig
		log.Printf("%s received, shutting down", s)
		cancel()
	}()

	r := NewRunner(cfg)
	r.Run(ctx)
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func parseDurationEnv(key string, def time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	// Accept either a duration string ("30s") or a millisecond integer.
	if d, err := time.ParseDuration(v); err == nil {
		return d
	}
	if ms, err := strconv.Atoi(v); err == nil {
		return time.Duration(ms) * time.Millisecond
	}
	log.Printf("invalid %s=%q, using default %s", key, v, def)
	return def
}
