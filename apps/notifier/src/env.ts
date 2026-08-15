import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(5004),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  /**
   * Bearer secret for the cron endpoints. Unset means they refuse everything —
   * an open drain endpoint lets anyone force delivery attempts and burn the
   * retry budget on every pending event.
   */
  CRON_SECRET: z.string().min(16).optional(),

  /**
   * Whether this process polls on its own.
   *
   * "on" (default) is the long-running container: the loop below owns the
   * cadence, which is what docker compose and a Fly deployment want.
   *
   * "off" is serverless, where nothing stays resident between requests. An
   * external scheduler POSTs /drain and /sweep instead; the work is identical,
   * only the trigger differs.
   */
  NOTIFIER_POLL: z.union([z.literal("on"), z.literal("off")]).default("on"),

  POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(5000),
  // Heartbeats only need to trip within seconds of being late, and the sweep
  // touches every enabled row, so it runs on a slower cadence than the drain.
  HEARTBEAT_SWEEP_MS: z.coerce.number().int().min(1000).default(30000),
  // Added on top of each location's own derived threshold. Absorbs probe
  // jitter so a slow region doesn't flap between silent and recovered.
  LOCATION_SILENT_GRACE_SECONDS: z.coerce.number().int().min(0).default(60),
});

export const env = schema.parse(process.env);
