import type { MiddlewareHandler } from "hono";

/**
 * Bearer-token auth against one or more accepted keys.
 *
 * More than one because the operational endpoints have two legitimate callers
 * with separate lifecycles: the dashboard's System page uses `PROBE_API_KEY`,
 * and a hosted scheduler sends whatever secret it was configured with — Vercel
 * Cron, for instance, attaches `Authorization: Bearer $CRON_SECRET` itself and
 * offers no way to change that. Rotating one shouldn't take the other down.
 *
 * Empty entries are dropped, so an unset secret grants nothing rather than
 * matching a caller that sends no token.
 */
export function apiKeyAuth(expected: string | Array<string | undefined>): MiddlewareHandler {
  const keys = (Array.isArray(expected) ? expected : [expected]).filter(
    (k): k is string => typeof k === "string" && k.length > 0,
  );

  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token || !keys.some((k) => timingSafeEqual(token, k))) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
