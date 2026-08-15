import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PROBE_API_KEY: z.string().min(8),
  // Used to sign status-page unlock tokens. Must match between API and the
  // status-page front-end (which calls /v1/pages/unlock to mint tokens).
  PAGE_UNLOCK_SECRET: z.string().min(16).default("change-me-in-production-please"),
  /**
   * Accepted alongside PROBE_API_KEY on /v1/system/*, for a hosted scheduler
   * that sends its own secret. Vercel Cron attaches
   * `Authorization: Bearer $CRON_SECRET` and can't be told to send anything
   * else. Unset means only PROBE_API_KEY works.
   */
  CRON_SECRET: z.string().min(16).optional(),
  // Slack app signing secret for /webhooks/slack signature verification.
  // Optional — when unset, the endpoint rejects all requests.
  SLACK_SIGNING_SECRET: z.string().optional(),
  // Retention sweeper (internal scheduler). Disable by setting to "off" or 0.
  // Defaults match the standalone retention.ts script so behavior is the
  // same whether the cleanup runs from cron or the API process.
  RETENTION_ENABLED: z.union([z.literal("off"), z.literal("on")]).default("on"),
  RETENTION_RUN_DAYS: z.coerce.number().int().min(1).max(3650).default(180),
  RETENTION_EVENT_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  /**
   * Cron-style daily-of-day in 24h "HH:MM" UTC format. Default 04:00 UTC —
   * outside typical user/probe peak hours. The internal scheduler fires
   * once per day at this clock time and on process startup if the
   * previous run is missed.
   */
  RETENTION_AT_UTC: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("04:00"),
  PORT: z.coerce.number().int().positive().default(5002),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const env = schema.parse(process.env);
