import { handle } from "hono/vercel";
import { createApp } from "../src/app";

/**
 * Vercel entrypoint. See apps/api/api/index.ts — same shape, same reasons.
 *
 * The polling loop in `src/index.ts` is deliberately not imported: a function
 * is frozen once it responds, so a loop would either be killed mid-batch or
 * keep the invocation billable forever. Set `NOTIFIER_POLL=off` and let the
 * cron entries in vercel.json call /cron/drain and /cron/sweep.
 */
export const config = { runtime: "nodejs" };

const app = createApp();

export const GET = handle(app);
export const POST = handle(app);
