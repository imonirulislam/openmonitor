import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { Assertion, HeaderEntry } from "./assertions";

// ---------- Enums ----------

export const userRoleEnum = pgEnum("user_role", ["admin", "editor", "viewer"]);
export const monitorStatusEnum = pgEnum("monitor_status", ["up", "down", "degraded", "unknown"]);
export const monitorKindEnum = pgEnum("monitor_kind", ["http", "tcp", "dns"]);
/**
 * How per-region results reduce to one global status for a monitor.
 *   any      — down if ≥1 region says down (default; matches single-region behavior)
 *   majority — down if more than half of reporting regions say down
 *   all      — down only if every reporting region says down
 * Regions sitting at `unknown` are excluded from the denominator, so adding a
 * region doesn't drag existing monitors toward `unknown`.
 */
export const monitorRegionPolicyEnum = pgEnum("monitor_region_policy", ["any", "majority", "all"]);
export const incidentStatusEnum = pgEnum("incident_status", [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
]);
export const incidentSeverityEnum = pgEnum("incident_severity", ["minor", "major", "critical"]);
export const maintenanceStatusEnum = pgEnum("maintenance_status", [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);
export const channelTypeEnum = pgEnum("channel_type", ["slack"]);
export const eventStatusEnum = pgEnum("event_status", ["pending", "sent", "failed"]);
export const eventTypeEnum = pgEnum("event_type", [
  "monitor.down",
  "monitor.recovered",
  "monitor.degraded",
  "incident.created",
  "incident.updated",
  "incident.resolved",
  "maintenance.scheduled",
  "maintenance.started",
  "maintenance.ended",
  // A probe location stopped reporting / started again. Not tied to one monitor,
  // so these route via `monitorIds` like the incident events do.
  "location.silent",
  "location.recovered",
]);

// ---------- Auth (Auth.js v5 compatible shape) ----------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 200 }),
    image: text("image"),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    passwordHash: text("password_hash"),
    // NOTE: legacy global role. Effective role lives in workspace_members.role
    // per (workspace, user). Kept here for back-compat with Auth.js + a future
    // "site admin" concept (e.g. operator with cross-workspace visibility).
    role: userRoleEnum("role").notNull().default("viewer"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

// Field names are snake_case here to match what `@auth/drizzle-adapter`
// expects on the `DefaultPostgresAccountsTable` type — it indexes by the JS
// property name, not the SQL column name. Don't rename to camelCase without
// also wrapping the table in a custom adapter.
export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    provider: varchar("provider", { length: 100 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: varchar("token_type", { length: 50 }),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: varchar("session_token", { length: 255 }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------- Workspaces ----------
//
// A workspace is a tenant: its own monitors, incidents, channels, status
// pages, audit logs. Users belong to workspaces via workspace_members with a
// per-workspace role.

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("workspaces_slug_unique").on(t.slug)],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("workspace_members_user_idx").on(t.userId),
  ],
);

// ---------- Status pages ----------
//
// One workspace can own N status pages. The slug is the page's subdomain under
// STATUS_PAGE_ROOT_DOMAIN — hence unique across workspaces — and a custom
// domain overrides it.

export const statusPages = pgTable(
  "status_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    isPublic: boolean("is_public").notNull().default(true),
    customDomain: varchar("custom_domain", { length: 255 }),
    logoUrl: text("logo_url"),
    // Favicon — surfaced via Next.js metadata on the public page. If null,
    // the public app falls back to the default favicon. Separate from
    // logoUrl so admins can have a small icon and a larger header logo.
    iconUrl: text("icon_url"),
    // Brand color stored as a CSS color string (hex or oklch). Rendered into a
    // <style> on the public page; no validation beyond a length cap because
    // the column is admin-set, not user input.
    primaryColor: varchar("primary_color", { length: 64 }),
    customCss: text("custom_css"),
    // Optional links shown on the public page chrome:
    //   - homepageUrl wraps the page logo/title.
    //   - contactUrl is a footer link (also accepts `mailto:`).
    homepageUrl: text("homepage_url"),
    contactUrl: text("contact_url"),
    // Optional scrypt password hash. When set, the public API requires a
    // signed unlock token in the request and the status-page front-end
    // redirects unauth'd visitors to /unlock.
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Global, not per-workspace: the slug is the page's subdomain under
    // STATUS_PAGE_ROOT_DOMAIN, so two workspaces can't both hold it.
    uniqueIndex("status_pages_slug_unique").on(t.slug),
    uniqueIndex("status_pages_custom_domain_unique").on(t.customDomain),
  ],
);

// ---------- Page components ----------
//
// A "component" is whatever appears as a row on the public status page. Each
// is either backed by a monitor (`type = 'monitor'`) and inherits its uptime
// from probe results, or is admin-toggled (`type = 'static'`) — useful for
// services we can't probe directly (third-party SaaS, customer support).
// Components can be ungrouped (rendered at the top) or sit inside a group
// header. Replaces the original status_page_monitors join table.

export const pageComponentTypeEnum = pgEnum("page_component_type", ["monitor", "static"]);

export const pageComponentGroups = pgTable(
  "page_component_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    statusPageId: uuid("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    // Positions are not unique — admin can drag-reorder freely; ties break by
    // created_at. Same convention as openstatus.
    position: integer("position").notNull().default(0),
    defaultOpen: boolean("default_open").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("page_component_groups_page_idx").on(t.statusPageId, t.position)],
);

export const pageComponents = pgTable(
  "page_components",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    statusPageId: uuid("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: pageComponentTypeEnum("type").notNull().default("monitor"),
    // monitor_id is required when type='monitor', null when type='static'. The
    // CHECK constraint below enforces this. ON DELETE CASCADE keeps a
    // monitor delete from leaving orphan monitor-typed components.
    monitorId: uuid("monitor_id").references(() => monitors.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => pageComponentGroups.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    // For static components only: admin-toggled status. Ignored when
    // type='monitor' (use the linked monitor's currentStatus instead).
    staticStatus: monitorStatusEnum("static_status").default("up"),
    // Position among ungrouped components. group_position is position within
    // a group when group_id is set.
    position: integer("position").notNull().default(0),
    groupPosition: integer("group_position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("page_components_page_idx").on(t.statusPageId, t.position),
    index("page_components_group_idx").on(t.groupId, t.groupPosition),
    // Same-monitor-twice-on-same-page is meaningless; enforce one row per
    // (page, monitor) when monitor_id is set.
    uniqueIndex("page_components_page_monitor_unique")
      .on(t.statusPageId, t.monitorId)
      .where(sql`${t.monitorId} IS NOT NULL`),
  ],
);

// ---------- Monitors ----------

export const monitors = pgTable(
  "monitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    /** http | tcp | dns. CHECK constraints below enforce per-kind required fields. */
    kind: monitorKindEnum("kind").notNull().default("http"),
    /** HTTP only — full URL. NULL for tcp/dns. */
    url: text("url"),
    /** HTTP only. NULL for tcp/dns. */
    method: varchar("method", { length: 10 }).default("GET"),
    /** TCP + DNS only — hostname (DNS) or hostname/IP (TCP). NULL for HTTP. */
    host: varchar("host", { length: 255 }),
    /** TCP only — 1..65535. NULL for HTTP/DNS. */
    port: integer("port"),
    /**
     * Request headers as an ordered list. Array shape (vs map) preserves order
     * and allows duplicate keys (e.g. multiple `Set-Cookie`). Mirrors openstatus.
     */
    headers: jsonb("headers").$type<HeaderEntry[]>().notNull().default([]),
    /**
     * Per-kind assertions evaluated by the checker. See `packages/db/src/assertions.ts`
     * for the discriminated-union shape. Empty array = "no assertions configured";
     * the HTTP prober treats that as "any 2xx is OK".
     */
    assertions: jsonb("assertions").$type<Assertion[]>().notNull().default([]),
    body: text("body"),
    intervalSeconds: integer("interval_seconds").notNull().default(60),
    timeoutMs: integer("timeout_ms").notNull().default(10000),
    /** Latency threshold: probe still up but `latency_ms > degraded_after_ms` → degraded. */
    degradedAfterMs: integer("degraded_after_ms"),
    followRedirects: boolean("follow_redirects").notNull().default(true),
    // Retry policy. The probe is considered "down" only after the initial
    // attempt + retry_count failed attempts in a row. Default 0 = no retries
    // (fail fast). retry_delay_seconds is the wait between attempts.
    retryCount: integer("retry_count").notNull().default(0),
    retryDelaySeconds: integer("retry_delay_seconds").notNull().default(5),
    /**
     * Number of consecutive `down` probes that triggers auto-incident
     * creation. NULL or 0 disables the feature. The matching incident is
     * auto-resolved on recovery.
     */
    autoIncidentThreshold: integer("auto_incident_threshold"),
    /**
     * Running count of consecutive `down` probes for this monitor. The
     * probes route bumps it on every ingest; never edited by hand. Used
     * by the auto-incident check to know when to fire.
     */
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    /**
     * Cache of the reduction over `monitor_region_status`, not the source of
     * truth. Kept so existing read paths don't need to aggregate on every
     * query. Written by the probe ingest route after recomputing.
     */
    currentStatus: monitorStatusEnum("current_status").notNull().default("unknown"),
    regionPolicy: monitorRegionPolicyEnum("region_policy").notNull().default("any"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // slug is unique within a workspace. Two workspaces can each have an
    // "api" monitor with no collision.
    uniqueIndex("monitors_workspace_slug_unique").on(t.workspaceId, t.slug),
    index("monitors_workspace_idx").on(t.workspaceId),
    // Per-kind required fields. The checker dispatches on `kind`, so missing
    // values for the active kind would surface as runtime errors rather than
    // probe results.
    check(
      "monitors_kind_required_fields",
      sql`(
        (kind = 'http' AND url IS NOT NULL AND method IS NOT NULL)
        OR (kind = 'tcp' AND host IS NOT NULL AND port IS NOT NULL)
        OR (kind = 'dns' AND host IS NOT NULL)
      )`,
    ),
  ],
);

export const monitorRegionStatus = pgTable(
  "monitor_region_status",
  {
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    region: varchar("region", { length: 50 }).notNull(),
    status: monitorStatusEnum("status").notNull().default("unknown"),
    // Per-region, so auto-incident thresholds count sustained failure in one
    // place rather than interleaved reports from several.
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.monitorId, t.region] }),
    index("monitor_region_status_monitor_idx").on(t.monitorId),
  ],
);

// ---------- Probe locations ----------

/**
 * A place probes run from. The token both authenticates the checker and
 * identifies which region it is — `region` is never taken from the request
 * body, so a checker cannot claim to be somewhere it isn't.
 *
 * Only the hash is stored; the plaintext token is shown once at creation.
 */
export const probeLocations = pgTable(
  "probe_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * NULL means a shared location the operator runs: selectable by every
     * workspace when configuring a monitor. Set means a private location owned
     * by one workspace, for probing inside that tenant's own network.
     */
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    // Human label, e.g. "EU West (Frankfurt)".
    name: varchar("name", { length: 100 }).notNull(),
    // Stored on every probe result; unique per workspace.
    region: varchar("region", { length: 50 }).notNull(),
    // Same scrypt format as packages/auth/src/password.ts.
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    /**
     * Bumped on every successful ingest. Lets the dashboard tell "this region
     * is not reporting" apart from "this service has no probes", and is the
     * hook for a future `location.silent` event.
     */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    /**
     * Set when the sweeper has alerted that this location went silent, cleared
     * when it reports again. Makes the sweep idempotent — without it every tick
     * would re-emit while the location stays down.
     */
    silentAlertedAt: timestamp("silent_alerted_at", { withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Postgres treats NULLs as distinct, so a single (workspace_id, region)
    // index would not stop two shared locations claiming the same region.
    uniqueIndex("probe_locations_shared_region_unique")
      .on(t.region)
      .where(sql`${t.workspaceId} IS NULL`),
    uniqueIndex("probe_locations_private_region_unique")
      .on(t.workspaceId, t.region)
      .where(sql`${t.workspaceId} IS NOT NULL`),
    uniqueIndex("probe_locations_token_hash_unique").on(t.tokenHash),
    index("probe_locations_workspace_idx").on(t.workspaceId),
  ],
);

/**
 * Which monitors a location is allowed to probe and report on. The join is the
 * authorization check: probe ingest resolves the location from its token, then
 * requires a row here for the monitor being reported.
 */
export const probeLocationMonitors = pgTable(
  "probe_location_monitors",
  {
    probeLocationId: uuid("probe_location_id")
      .notNull()
      .references(() => probeLocations.id, { onDelete: "cascade" }),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.probeLocationId, t.monitorId] }),
    index("probe_location_monitors_monitor_idx").on(t.monitorId),
  ],
);

// ---------- Incidents ----------

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /**
     * Per-workspace sequential number, so an incident can be addressed and
     * talked about as "#42" instead of a uuid. Allocated by
     * `nextIncidentNumber` under an advisory lock — see there for why.
     */
    number: integer("number").notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    status: incidentStatusEnum("status").notNull().default("investigating"),
    severity: incidentSeverityEnum("severity").notNull().default("minor"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    /**
     * True when the probes route opened this incident automatically after a
     * monitor crossed its `auto_incident_threshold`. Used to scope the
     * auto-resolve query so we never close a manually-created incident.
     */
    autoCreated: boolean("auto_created").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("incidents_workspace_idx").on(t.workspaceId, t.startedAt),
    uniqueIndex("incidents_workspace_number_unique").on(t.workspaceId, t.number),
  ],
);

export const incidentUpdates = pgTable(
  "incident_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    status: incidentStatusEnum("status").notNull(),
    message: text("message").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("incident_updates_incident_idx").on(t.incidentId, t.createdAt)],
);

export const incidentMonitors = pgTable(
  "incident_monitors",
  {
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.incidentId, t.monitorId] })],
);

// Saved canned title/message pairs an editor can apply when opening or
// updating an incident. Plain text only — no interpolation in v1.
export const incidentTemplates = pgTable(
  "incident_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    titleTemplate: varchar("title_template", { length: 300 }).notNull(),
    messageTemplate: text("message_template").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("incident_templates_workspace_idx").on(t.workspaceId, t.name)],
);

// ---------- Maintenance ----------

export const maintenances = pgTable(
  "maintenances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    status: maintenanceStatusEnum("status").notNull().default("scheduled"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    // Optional iCal RRULE (RFC 5545) for repeating windows. The public API
    // expands this on-read into projected occurrences; nothing in the DB
    // tracks materialized instances. recurrenceUntil caps the projection.
    recurrenceRule: varchar("recurrence_rule", { length: 500 }),
    recurrenceUntil: timestamp("recurrence_until", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("maintenances_workspace_idx").on(t.workspaceId, t.startsAt)],
);

export const maintenanceMonitors = pgTable(
  "maintenance_monitors",
  {
    maintenanceId: uuid("maintenance_id")
      .notNull()
      .references(() => maintenances.id, { onDelete: "cascade" }),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.maintenanceId, t.monitorId] })],
);

// ---------- Heartbeat (push) monitors ----------
//
// HTTP probes are pull-based: we hit a target on a schedule. Heartbeat
// monitors are push-based: a cron job hits POST /v1/heartbeats/<token> on its
// own schedule and we alert if the pings stop. Token is opaque-random and
// scoped to one workspace, with no user-supplied identifier.
export const heartbeatMonitors = pgTable(
  "heartbeat_monitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    // Expected gap between pings. Sweeper flips status to "down" if
    // `now - lastPingAt > expectedIntervalSeconds + graceSeconds`.
    expectedIntervalSeconds: integer("expected_interval_seconds").notNull().default(300),
    graceSeconds: integer("grace_seconds").notNull().default(60),
    token: varchar("token", { length: 80 }).notNull(),
    lastPingAt: timestamp("last_ping_at", { withTimezone: true }),
    currentStatus: monitorStatusEnum("current_status").notNull().default("unknown"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("heartbeat_monitors_workspace_slug_unique").on(t.workspaceId, t.slug),
    uniqueIndex("heartbeat_monitors_token_unique").on(t.token),
    index("heartbeat_monitors_status_idx").on(t.enabled, t.lastPingAt),
  ],
);

// ---------- Notifications ----------

export type SlackChannelConfig = {
  webhookUrl: string;
  channel?: string;
};

export const notificationChannels = pgTable(
  "notification_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: channelTypeEnum("type").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    config: jsonb("config").$type<SlackChannelConfig>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notification_channels_workspace_idx").on(t.workspaceId)],
);

export const monitorChannels = pgTable(
  "monitor_channels",
  {
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => notificationChannels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.monitorId, t.channelId] })],
);

// ---------- Audit log ----------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: varchar("actor_email", { length: 320 }),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("target_type", { length: 50 }).notNull(),
    targetId: uuid("target_id"),
    targetLabel: varchar("target_label", { length: 200 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("audit_logs_created_idx").on(t.createdAt),
  ],
);

// ---------- Events outbox (consumed by apps/notifier) ----------

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: eventTypeEnum("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: eventStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("events_status_next_idx").on(t.status, t.nextAttemptAt),
    index("events_workspace_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

// ---------- Relations ----------

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  monitors: many(monitors),
  statusPages: many(statusPages),
  incidents: many(incidents),
  maintenances: many(maintenances),
  notificationChannels: many(notificationChannels),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [workspaceMembers.userId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  workspaces: many(workspaceMembers),
}));

export const statusPagesRelations = relations(statusPages, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [statusPages.workspaceId],
    references: [workspaces.id],
  }),
  components: many(pageComponents),
  componentGroups: many(pageComponentGroups),
}));

export const pageComponentGroupsRelations = relations(pageComponentGroups, ({ many, one }) => ({
  statusPage: one(statusPages, {
    fields: [pageComponentGroups.statusPageId],
    references: [statusPages.id],
  }),
  components: many(pageComponents),
}));

export const pageComponentsRelations = relations(pageComponents, ({ one }) => ({
  statusPage: one(statusPages, {
    fields: [pageComponents.statusPageId],
    references: [statusPages.id],
  }),
  monitor: one(monitors, {
    fields: [pageComponents.monitorId],
    references: [monitors.id],
  }),
  group: one(pageComponentGroups, {
    fields: [pageComponents.groupId],
    references: [pageComponentGroups.id],
  }),
}));

export const monitorsRelations = relations(monitors, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [monitors.workspaceId],
    references: [workspaces.id],
  }),
  incidents: many(incidentMonitors),
  channels: many(monitorChannels),
  pageComponents: many(pageComponents),
  regionStatus: many(monitorRegionStatus),
  probeLocations: many(probeLocationMonitors),
}));

export const monitorRegionStatusRelations = relations(monitorRegionStatus, ({ one }) => ({
  monitor: one(monitors, {
    fields: [monitorRegionStatus.monitorId],
    references: [monitors.id],
  }),
}));

export const probeLocationsRelations = relations(probeLocations, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [probeLocations.workspaceId],
    references: [workspaces.id],
  }),
  monitors: many(probeLocationMonitors),
}));

export const probeLocationMonitorsRelations = relations(probeLocationMonitors, ({ one }) => ({
  probeLocation: one(probeLocations, {
    fields: [probeLocationMonitors.probeLocationId],
    references: [probeLocations.id],
  }),
  monitor: one(monitors, {
    fields: [probeLocationMonitors.monitorId],
    references: [monitors.id],
  }),
}));

export const incidentsRelations = relations(incidents, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [incidents.workspaceId],
    references: [workspaces.id],
  }),
  updates: many(incidentUpdates),
  monitors: many(incidentMonitors),
  creator: one(users, {
    fields: [incidents.createdBy],
    references: [users.id],
  }),
}));

export const incidentUpdatesRelations = relations(incidentUpdates, ({ one }) => ({
  incident: one(incidents, {
    fields: [incidentUpdates.incidentId],
    references: [incidents.id],
  }),
}));

export const incidentMonitorsRelations = relations(incidentMonitors, ({ one }) => ({
  incident: one(incidents, {
    fields: [incidentMonitors.incidentId],
    references: [incidents.id],
  }),
  monitor: one(monitors, {
    fields: [incidentMonitors.monitorId],
    references: [monitors.id],
  }),
}));

export const maintenancesRelations = relations(maintenances, ({ many }) => ({
  monitors: many(maintenanceMonitors),
}));

export const maintenanceMonitorsRelations = relations(maintenanceMonitors, ({ one }) => ({
  maintenance: one(maintenances, {
    fields: [maintenanceMonitors.maintenanceId],
    references: [maintenances.id],
  }),
  monitor: one(monitors, {
    fields: [maintenanceMonitors.monitorId],
    references: [monitors.id],
  }),
}));

// ---------------------------------------------------------------------------
// Scheduled tasks
// ---------------------------------------------------------------------------

export const scheduledTaskStatusEnum = pgEnum("scheduled_task_status", ["ok", "error"]);

/**
 * Last-run bookkeeping for background sweeps.
 *
 * These used to live in module-level variables in the API process, which was
 * fine while the API was a long-running container that owned the timer. Under
 * cron-triggered invocations there is no process to hold them: every request
 * starts cold, so "when did retention last run" has to be durable or it reads
 * as "never" forever.
 *
 * `name` is the primary key rather than a surrogate uuid. There is exactly one
 * row per task and handlers upsert by name, so a uuid would need a unique(name)
 * beside it and make the conflict target indirect for no gain.
 */
export const scheduledTaskRuns = pgTable("scheduled_task_runs", {
  name: varchar("name", { length: 64 }).primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull().defaultNow(),
  lastStatus: scheduledTaskStatusEnum("last_status").notNull(),
  lastDurationMs: integer("last_duration_ms").notNull(),
  // Null on success. Kept so an operator can see why a sweep stopped working
  // without going to the logs of a container that no longer exists.
  lastError: text("last_error"),
  // Whatever the task counted — rows deleted, events drained. Shape is the
  // task's own business, so it stays loose.
  lastResult: jsonb("last_result").$type<Record<string, number>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationChannelsRelations = relations(notificationChannels, ({ many }) => ({
  monitors: many(monitorChannels),
}));

export const monitorChannelsRelations = relations(monitorChannels, ({ one }) => ({
  monitor: one(monitors, {
    fields: [monitorChannels.monitorId],
    references: [monitors.id],
  }),
  channel: one(notificationChannels, {
    fields: [monitorChannels.channelId],
    references: [notificationChannels.id],
  }),
}));
