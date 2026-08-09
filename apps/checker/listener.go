package main

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
)

// listen subscribes to `pg_notify('monitor_changed', ...)` and emits the
// notified payload (a monitor id, or an empty string for "any change") onto
// the changes channel. On any error it logs and reconnects with backoff.
//
// Returns when ctx is cancelled.
func listen(ctx context.Context, dsn string, changes chan<- string) {
	if dsn == "" {
		log.Println("listener: DATABASE_URL not set, falling back to polling only")
		return
	}
	for {
		if err := listenLoop(ctx, dsn, changes); err != nil {
			log.Printf("listener: %v (reconnecting in 3s)", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(3 * time.Second):
		}
	}
}

func listenLoop(ctx context.Context, dsn string, changes chan<- string) error {
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return err
	}
	defer conn.Close(context.Background())

	if _, err := conn.Exec(ctx, "LISTEN monitor_changed"); err != nil {
		return err
	}
	log.Println("listener: subscribed to monitor_changed")

	for {
		n, err := conn.WaitForNotification(ctx)
		if err != nil {
			return err
		}
		select {
		case changes <- n.Payload:
		case <-ctx.Done():
			return nil
		}
	}
}
