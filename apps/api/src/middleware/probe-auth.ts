import { and, db, eq, hashProbeToken, schema } from "@openmonitor/db";
import type { MiddlewareHandler } from "hono";

/**
 * The probe location a request came from, resolved from its bearer token.
 *
 * There is deliberately no shared-secret fallback. A single global key can't say
 * *which* region is calling, so `region` would have to be taken from the request
 * body — letting any key holder attribute results to any region, and making one
 * leaked key unrevocable without redeploying every checker. The token is the
 * region's identity.
 */
export interface ProbeIdentity {
  locationId: string;
  region: string;
  /**
   * Null for a shared, operator-run location, which may serve monitors in any
   * workspace. For those, the probe_location_monitors join is the only
   * authorization — there is no workspace to compare against.
   */
  workspaceId: string | null;
}

declare module "hono" {
  interface ContextVariableMap {
    probeIdentity: ProbeIdentity;
  }
}

export function probeAuth(): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return c.json({ error: "unauthorized" }, 401);

    // Indexed lookup on a deterministic hash — see packages/db/src/probe-token.ts
    // for why this is SHA-256 rather than the salted scrypt used for passwords.
    const [location] = await db()
      .select({
        id: schema.probeLocations.id,
        region: schema.probeLocations.region,
        workspaceId: schema.probeLocations.workspaceId,
      })
      .from(schema.probeLocations)
      .where(
        and(
          eq(schema.probeLocations.tokenHash, hashProbeToken(token)),
          eq(schema.probeLocations.enabled, true),
        ),
      )
      .limit(1);

    if (!location) return c.json({ error: "unauthorized" }, 401);

    c.set("probeIdentity", {
      locationId: location.id,
      region: location.region,
      workspaceId: location.workspaceId,
    });
    return next();
  };
}
