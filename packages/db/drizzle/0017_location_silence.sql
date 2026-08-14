-- Alerting when a probe location stops reporting.
--
-- last_seen_at was already recorded on every ingest but nothing watched it, so a
-- checker that died looked identical to a service nobody was probing: results
-- simply stopped arriving.
--
-- silent_alerted_at makes the sweep idempotent. Without it the sweeper would
-- re-emit an event on every tick for as long as the location stayed silent.

ALTER TYPE "event_type" ADD VALUE IF NOT EXISTS 'location.silent';--> statement-breakpoint
ALTER TYPE "event_type" ADD VALUE IF NOT EXISTS 'location.recovered';--> statement-breakpoint

ALTER TABLE "probe_locations"
  ADD COLUMN IF NOT EXISTS "silent_alerted_at" timestamp with time zone;
