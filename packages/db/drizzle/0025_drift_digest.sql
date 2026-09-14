-- Weekly report of monitors whose p95 has crept up.
--
-- Slow degradation never crosses a threshold, so nothing alerts on it and
-- nobody goes looking. This is the one event type that is periodic rather than
-- a reaction to a state change.
ALTER TYPE "event_type" ADD VALUE IF NOT EXISTS 'digest.drift';
