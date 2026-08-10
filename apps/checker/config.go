package main

import "time"

type Config struct {
	APIBaseURL string
	// APIToken identifies this probe location. The server derives the region
	// from it, so a checker cannot attribute results to somewhere it is not.
	APIToken       string
	RefreshEvery   time.Duration
	DefaultTimeout time.Duration
	// DatabaseURL is optional. When set, the checker subscribes to
	// `pg_notify('monitor_changed', ...)` and refreshes its monitor list
	// immediately on each notification. When unset, the checker still works
	// but only refreshes on the periodic tick.
	DatabaseURL string
}
