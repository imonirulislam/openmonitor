import "./load-env";
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, sql } from "drizzle-orm";
import { createDb } from "./client";
import {
  incidentMonitors,
  incidents,
  incidentUpdates,
  maintenanceMonitors,
  maintenances,
  monitorRegionStatus,
  monitorRuns,
  monitors,
  pageComponents,
  statusPages,
  users,
  workspaceMembers,
  workspaces,
} from "./schema";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

// Same scrypt format as packages/auth/src/password.ts. Kept in sync manually
// because moving it into a shared package would create a circular dependency
// (auth → db → auth).
async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(plain, salt, 64);
  return ["scrypt", "N=16384", "r=8", "p=1", salt.toString("base64"), hash.toString("base64")].join(
    "$",
  );
}

/**
 * Synthesize plausible per-phase HTTP latencies for a probe with total
 * latency `total`. Roughly mirrors the shape of real httptrace output:
 *   - DNS / Connect / TLS each take a small, mostly-fixed slice
 *   - TTFB dominates (server processing time)
 *   - Transfer is small for the tiny health-check responses we probe
 *
 * Returns null phases when `total` is null (i.e., the probe failed before
 * any response).
 */
function splitLatencyIntoPhases(total: number | null): {
  dns: number | null;
  connect: number | null;
  tls: number | null;
  ttfb: number | null;
  transfer: number | null;
} {
  if (total === null) {
    return { dns: null, connect: null, tls: null, ttfb: null, transfer: null };
  }
  // Pick fixed-ish slices; clamp so the sum doesn't overshoot the total.
  const dns = clamp(Math.floor(2 + Math.random() * 6), 1, total);
  const remainingAfterDns = total - dns;
  const connect = clamp(Math.floor(15 + Math.random() * 25), 1, remainingAfterDns);
  const remainingAfterConnect = remainingAfterDns - connect;
  const tls = clamp(Math.floor(25 + Math.random() * 50), 1, remainingAfterConnect);
  const remainingAfterTls = remainingAfterConnect - tls;
  const transfer = clamp(Math.floor(2 + Math.random() * 8), 0, remainingAfterTls);
  const ttfb = Math.max(0, total - dns - connect - tls - transfer);
  return { dns, connect, tls, ttfb, transfer };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set");

  const db = createDb(url);

  console.log("Seeding…");

  // ---------- Default workspace ----------
  // Pin to the well-known UUID created by migration 0002. This way we keep
  // matching the original workspace even after admins rename its slug
  // (otherwise re-running the seed inserts a brand-new "default"-slugged
  // workspace alongside the renamed one — duplicate rows, broken slug-only
  // lookups on the public page).
  const SEED_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
  const existingWs = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, SEED_WORKSPACE_ID))
    .limit(1);
  let workspaceId: string;
  if (existingWs.length > 0) {
    // Don't touch slug or name — the user may have renamed.
    workspaceId = existingWs[0]!.id;
  } else {
    const [created] = await db
      .insert(workspaces)
      .values({
        id: SEED_WORKSPACE_ID,
        slug: "default",
        name: "Default workspace",
      })
      .returning({ id: workspaces.id });
    if (!created) throw new Error("failed to create default workspace");
    workspaceId = created.id;
  }

  // ---------- Admin user + membership ----------
  const adminEmail = "admin@openmonitor.local";
  const adminPassword = "changeme";
  const adminHash = await hashPassword(adminPassword);

  const [admin] = await db
    .insert(users)
    .values({
      email: adminEmail,
      name: "OpenMonitor Admin",
      role: "admin",
      passwordHash: adminHash,
      emailVerified: new Date(),
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { passwordHash: adminHash, role: "admin", updatedAt: new Date() },
    })
    .returning({ id: users.id });
  if (!admin) throw new Error("failed to create admin user");

  await db
    .insert(workspaceMembers)
    .values({ workspaceId, userId: admin.id, role: "admin" })
    .onConflictDoUpdate({
      target: [workspaceMembers.workspaceId, workspaceMembers.userId],
      set: { role: "admin" },
    });

  // ---------- Monitors ----------
  // <openmonitor-monitors>
  const seedMonitors = [
    {
      slug: "web",
      name: "Web App",
      description: "Marketing site and dashboard",
      url: "https://example.com",
      method: "GET",
      intervalSeconds: 60,
    },
    {
      slug: "api",
      name: "Public API",
      description: "Public-facing REST API",
      url: "https://api.example.com/health",
      method: "GET",
      intervalSeconds: 60,
    },
    {
      slug: "docs",
      name: "Docs",
      description: "Documentation site",
      url: "https://docs.example.com",
      method: "GET",
      intervalSeconds: 120,
    },
    {
      slug: "cdn",
      name: "CDN",
      description: "Static asset delivery",
      url: "https://cdn.example.com/health",
      method: "GET",
      intervalSeconds: 60,
    },
  ];

  for (const m of seedMonitors) {
    await db
      .insert(monitors)
      .values({ ...m, workspaceId })
      .onConflictDoUpdate({
        // slug is unique within (workspace_id, slug) post-Phase-1.
        target: [monitors.workspaceId, monitors.slug],
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          url: sql`excluded.url`,
          updatedAt: new Date(),
        },
      });
  }

  // ---------- Default status page + linkage ----------
  const [page] = await db
    .insert(statusPages)
    .values({
      workspaceId,
      slug: "default",
      name: "OpenMonitor",
      description: "Live status for your services",
      isPublic: true,
    })
    .onConflictDoUpdate({
      target: [statusPages.workspaceId, statusPages.slug],
      set: { name: sql`excluded.name`, updatedAt: new Date() },
    })
    .returning({ id: statusPages.id });
  if (!page) throw new Error("failed to create default status page");

  // Re-fetch with IDs (workspace-scoped).
  const monitorRows = await db
    .select({ id: monitors.id, slug: monitors.slug })
    .from(monitors)
    .where(eq(monitors.workspaceId, workspaceId));
  const idBySlug = new Map(monitorRows.map((r) => [r.slug, r.id]));

  // Link all monitors to the default status page as page components. Wipe
  // first so re-running the seed produces a clean slate; the partial unique
  // index on (status_page_id, monitor_id) doesn't play well with ON CONFLICT
  // without an explicit `targetWhere`.
  await db.delete(pageComponents).where(eq(pageComponents.statusPageId, page.id));
  const fullMonitors = await db
    .select({
      id: monitors.id,
      slug: monitors.slug,
      name: monitors.name,
      description: monitors.description,
    })
    .from(monitors)
    .where(eq(monitors.workspaceId, workspaceId));
  for (let i = 0; i < fullMonitors.length; i++) {
    const m = fullMonitors[i]!;
    await db.insert(pageComponents).values({
      statusPageId: page.id,
      workspaceId,
      type: "monitor",
      monitorId: m.id,
      name: m.name,
      description: m.description,
      position: i,
    });
  }

  // ---------- Probe history (90 days, hourly) ----------
  // Wipe any existing seeded probe history first so re-running the seed is
  // idempotent.
  await db.delete(monitorRuns);

  // Per-monitor down/degraded days. Every monitor has at least one of each
  // somewhere in the 90-day window so the dashboards show real status
  // variety on every page (not just on the one or two "interesting" ones).
  const DAYS = 90;
  const HOURLY_PROBES_PER_DAY = 24;
  const downDaysBySlug: Record<string, Set<number>> = {
    web: new Set([12, 38, 67]),
    docs: new Set([5, 51]),
    cdn: new Set([22, 23, 80]), // a 2-day issue + later one
    api: new Set([2, 44]),
  };
  const degradedDaysBySlug: Record<string, Set<number>> = {
    web: new Set([60, 78]),
    docs: new Set([45, 70, 88]),
    cdn: new Set([15, 55]),
    api: new Set([8, 30, 75]),
  };
  // "Today" hours where each monitor sees a brief degradation, so the per-
  // monitor 24h timing-phases chart isn't a flat line. Hour-of-day, local.
  const todayDegradedHours: Record<string, Set<number>> = {
    web: new Set([3, 9, 14]),
    docs: new Set([7, 16]),
    cdn: new Set([5, 12, 19]),
    api: new Set([2, 11, 22]),
  };
  // And a single "blip" per monitor today to show the down color.
  const todayDownHour: Record<string, number> = {
    web: 6,
    docs: 13,
    cdn: 17,
    api: 4,
  };

  type RunRow = typeof monitorRuns.$inferInsert;
  const runs: RunRow[] = [];
  const now = new Date();
  const lastRunPerMonitor = new Map<string, RunRow>();

  for (const m of monitorRows) {
    const downDays = downDaysBySlug[m.slug] ?? new Set<number>();
    const degradedDays = degradedDaysBySlug[m.slug] ?? new Set<number>();
    const todayDegHours = todayDegradedHours[m.slug] ?? new Set<number>();
    const todayDownH = todayDownHour[m.slug];
    for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
      const isDown = downDays.has(dayOffset);
      const isDegraded = !isDown && degradedDays.has(dayOffset);
      const isToday = dayOffset === 0;
      for (let h = 0; h < HOURLY_PROBES_PER_DAY; h++) {
        const checkedAt = new Date(now);
        checkedAt.setDate(checkedAt.getDate() - dayOffset);
        checkedAt.setHours(h, Math.floor(Math.random() * 60), 0, 0);

        // Within a "down" day, ~70% of probes are down.
        // Within a "degraded" day, ~25% of probes are degraded, rest up.
        // Today: scatter degradations + one short outage so the per-monitor
        // 24h chart shows real variety (not a flat green line).
        let status: "up" | "down" | "degraded" = "up";
        if (isDown && Math.random() < 0.7) status = "down";
        else if (isDegraded && Math.random() < 0.25) status = "degraded";
        else if (isToday && todayDownH === h && Math.random() < 0.6) status = "down";
        else if (isToday && todayDegHours.has(h) && Math.random() < 0.5) status = "degraded";

        const latency =
          status === "up"
            ? 80 + Math.floor(Math.random() * 100)
            : status === "degraded"
              ? 600 + Math.floor(Math.random() * 800)
              : null;
        const statusCode = status === "down" ? 503 : 200;
        const phases = splitLatencyIntoPhases(latency);

        const row: RunRow = {
          monitorId: m.id,
          workspaceId,
          status,
          statusCode,
          latencyMs: latency,
          latencyDnsMs: phases.dns,
          latencyConnectMs: phases.connect,
          latencyTlsMs: phases.tls,
          latencyTtfbMs: phases.ttfb,
          latencyTransferMs: phases.transfer,
          region: "seed",
          error: status === "down" ? "upstream timeout" : null,
          checkedAt,
        };
        runs.push(row);
        lastRunPerMonitor.set(m.id, row);
      }
    }
  }

  // Insert in batches to avoid oversized parameter lists.
  const BATCH = 1000;
  for (let i = 0; i < runs.length; i += BATCH) {
    await db.insert(monitorRuns).values(runs.slice(i, i + BATCH));
  }

  // Update each monitor's currentStatus + lastCheckedAt from its latest run, and
  // mirror it into monitor_region_status for the region these synthetic runs were
  // written under. Without the region row, a reduction over "all regions" sees
  // nothing to reduce and would read as `unknown` despite current_status being set.
  for (const [monitorId, last] of lastRunPerMonitor) {
    await db
      .update(monitors)
      .set({ currentStatus: last.status!, lastCheckedAt: last.checkedAt })
      .where(eq(monitors.id, monitorId));

    // Deliberately "local", not the "seed" label the synthetic runs carry: the
    // real checker defaults to CHECKER_REGION=local, so it overwrites this exact
    // row on its first probe. Writing "seed" here would strand a region that
    // nothing ever updates, and it would skew the reduction forever.
    await db
      .insert(monitorRegionStatus)
      .values({
        monitorId,
        region: "local",
        status: last.status!,
        consecutiveFailures: 0,
        lastCheckedAt: last.checkedAt,
      })
      .onConflictDoUpdate({
        target: [monitorRegionStatus.monitorId, monitorRegionStatus.region],
        set: {
          status: last.status!,
          lastCheckedAt: last.checkedAt,
          consecutiveFailures: 0,
          updatedAt: new Date(),
        },
      });
  }

  // ---------- Past incidents (resolved, with timeline updates) ----------
  // Wipe prior seeded incidents so re-running is idempotent. We can't easily
  // distinguish "seeded" from "real" so just wipe everything — this seed is
  // for dev environments only.
  await db.delete(incidentMonitors);
  await db.delete(incidentUpdates);
  await db.delete(incidents);

  type SeedIncident = {
    title: string;
    severity: "minor" | "major" | "critical";
    monitorSlugs: string[];
    daysAgo: number;
    durationMinutes: number;
    updates: Array<{
      offsetMinutes: number; // from start
      status: "investigating" | "identified" | "monitoring" | "resolved";
      message: string;
    }>;
  };

  const pastIncidentsSeed: SeedIncident[] = [
    {
      title: "Elevated error rate on the web app",
      severity: "major",
      monitorSlugs: ["web"],
      daysAgo: 12,
      durationMinutes: 95,
      updates: [
        {
          offsetMinutes: 0,
          status: "investigating",
          message: "We're seeing an elevated 5xx rate on page loads. Engineers are investigating.",
        },
        {
          offsetMinutes: 18,
          status: "identified",
          message: "Cause identified: a recent deploy introduced a misconfigured timeout.",
        },
        {
          offsetMinutes: 55,
          status: "monitoring",
          message: "Rolled back the change. Error rate is recovering. Watching the next 30 min.",
        },
        {
          offsetMinutes: 95,
          status: "resolved",
          message: "Error rate is back to normal. Postmortem to follow.",
        },
      ],
    },
    {
      title: "Docs site upstream connectivity",
      severity: "minor",
      monitorSlugs: ["docs"],
      daysAgo: 5,
      durationMinutes: 22,
      updates: [
        {
          offsetMinutes: 0,
          status: "investigating",
          message: "Brief connectivity blip with our documentation host.",
        },
        {
          offsetMinutes: 22,
          status: "resolved",
          message: "Connectivity restored. No measurable impact on availability.",
        },
      ],
    },
    {
      title: "CDN outage during scheduled migration",
      severity: "critical",
      monitorSlugs: ["cdn"],
      daysAgo: 23,
      durationMinutes: 4 * 60 + 15,
      updates: [
        {
          offsetMinutes: 0,
          status: "investigating",
          message: "Static assets are currently unreachable. Investigating.",
        },
        {
          offsetMinutes: 30,
          status: "identified",
          message:
            "Database migration locked the primary table longer than expected. Working on a fix.",
        },
        {
          offsetMinutes: 240,
          status: "monitoring",
          message: "Assets are serving again. Watching for any regressions.",
        },
        {
          offsetMinutes: 255,
          status: "resolved",
          message: "Fully resolved. Migration completed.",
        },
      ],
    },
  ];

  for (const inc of pastIncidentsSeed) {
    const startedAt = new Date(now);
    startedAt.setDate(startedAt.getDate() - inc.daysAgo);
    startedAt.setHours(10 + Math.floor(Math.random() * 6), 0, 0, 0);
    const resolvedAt = new Date(startedAt.getTime() + inc.durationMinutes * 60_000);

    const [created] = await db
      .insert(incidents)
      .values({
        workspaceId,
        title: inc.title,
        severity: inc.severity,
        status: "resolved",
        startedAt,
        resolvedAt,
        createdBy: admin.id,
      })
      .returning({ id: incidents.id });
    if (!created) continue;

    for (const u of inc.updates) {
      await db.insert(incidentUpdates).values({
        incidentId: created.id,
        status: u.status,
        message: u.message,
        createdBy: admin?.id ?? null,
        createdAt: new Date(startedAt.getTime() + u.offsetMinutes * 60_000),
      });
    }

    for (const slug of inc.monitorSlugs) {
      const monitorId = idBySlug.get(slug);
      if (monitorId) {
        await db.insert(incidentMonitors).values({ incidentId: created.id, monitorId });
      }
    }
  }

  // ---------- Active incident ----------
  // One open minor incident on the API monitor so the page hero shows
  // something interesting.
  const activeStartedAt = new Date(Date.now() - 35 * 60_000);
  const [active] = await db
    .insert(incidents)
    .values({
      workspaceId,
      title: "Elevated public API latency",
      severity: "minor",
      status: "monitoring",
      startedAt: activeStartedAt,
      resolvedAt: null,
      createdBy: admin.id,
    })
    .returning({ id: incidents.id });

  if (active) {
    await db.insert(incidentUpdates).values([
      {
        incidentId: active.id,
        status: "investigating",
        message: "p95 latency on /v1 endpoints has crept up. Investigating which dependency.",
        createdBy: admin?.id ?? null,
        createdAt: activeStartedAt,
      },
      {
        incidentId: active.id,
        status: "identified",
        message: "A noisy neighbor on shared infra. Migrating affected traffic now.",
        createdBy: admin?.id ?? null,
        createdAt: new Date(activeStartedAt.getTime() + 10 * 60_000),
      },
      {
        incidentId: active.id,
        status: "monitoring",
        message: "Migration done; latency is recovering. Will watch for the next hour.",
        createdBy: admin?.id ?? null,
        createdAt: new Date(activeStartedAt.getTime() + 28 * 60_000),
      },
    ]);
    const apiId = idBySlug.get("api");
    if (apiId) {
      await db.insert(incidentMonitors).values({ incidentId: active.id, monitorId: apiId });
    }
  }

  // ---------- Maintenance ----------
  await db.delete(maintenanceMonitors);
  await db.delete(maintenances);

  // One past, one upcoming.
  const pastMaintStart = new Date(now);
  pastMaintStart.setDate(pastMaintStart.getDate() - 15);
  pastMaintStart.setHours(2, 0, 0, 0);
  const pastMaintEnd = new Date(pastMaintStart.getTime() + 90 * 60_000);
  const [pastMaint] = await db
    .insert(maintenances)
    .values({
      workspaceId,
      title: "Routine database upgrade",
      description:
        "Rolling Postgres minor version upgrade. Brief read-only window expected during failover.",
      status: "completed",
      startsAt: pastMaintStart,
      endsAt: pastMaintEnd,
      createdBy: admin.id,
    })
    .returning({ id: maintenances.id });
  if (pastMaint) {
    for (const slug of ["web", "docs", "cdn", "api"]) {
      const monitorId = idBySlug.get(slug);
      if (monitorId) {
        await db.insert(maintenanceMonitors).values({ maintenanceId: pastMaint.id, monitorId });
      }
    }
  }

  const upcomingMaintStart = new Date(now);
  upcomingMaintStart.setDate(upcomingMaintStart.getDate() + 4);
  upcomingMaintStart.setHours(3, 0, 0, 0);
  const upcomingMaintEnd = new Date(upcomingMaintStart.getTime() + 60 * 60_000);
  const [upcoming] = await db
    .insert(maintenances)
    .values({
      workspaceId,
      title: "Scheduled cache infrastructure migration",
      description: "Moving Redis cache to the new cluster. We expect minimal user-facing impact.",
      status: "scheduled",
      startsAt: upcomingMaintStart,
      endsAt: upcomingMaintEnd,
      createdBy: admin.id,
    })
    .returning({ id: maintenances.id });
  if (upcoming) {
    for (const slug of ["web", "docs"]) {
      const monitorId = idBySlug.get(slug);
      if (monitorId) {
        await db.insert(maintenanceMonitors).values({ maintenanceId: upcoming.id, monitorId });
      }
    }
  }

  console.log(`Seeded ${seedMonitors.length} monitors with ${runs.length} probe results.`);
  console.log(`Seeded ${pastIncidentsSeed.length} past incidents + 1 active incident.`);
  console.log("Seeded 1 past maintenance + 1 upcoming maintenance.");
  console.log(`Admin user: ${adminEmail} / ${adminPassword}  (CHANGE THIS BEFORE DEPLOYING)`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
