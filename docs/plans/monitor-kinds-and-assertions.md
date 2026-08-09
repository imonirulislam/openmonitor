# Monitor kinds + assertions + response-time thresholds

Plan for replacing the single `expected_status` rule with openstatus-style assertions, adding `tcp` and `dns` monitor kinds, and surfacing performance-degraded via a separate response-time threshold.

Reference repo at `_reference/openstatus/`. Files we modeled this plan on:

- Form: `apps/dashboard/src/components/forms/monitor/form-general.tsx`, `form-response-time.tsx`
- Schema: `packages/db/src/schema/monitors/monitor.ts`
- TS assertions: `packages/assertions/src/{v1,dictionary,types}.ts`
- Checker request: `apps/checker/request/request.go`
- Checker probers: `apps/checker/checker/{http,tcp,dns}.go`
- Checker handler reduction: `apps/checker/handlers/checker.go`
- Go assertions: `apps/checker/pkg/assertions/assertions.go`

---

## Reduction logic (the core finding)

Mirrored from `apps/checker/handlers/checker.go`:

```
if request errored or timed out:
    status = down  (their "error")
elif any assertion failed:
    retry; on final failure status = down
elif degradedAfterMs is set and latency > degradedAfterMs:
    status = degraded
else:
    status = up    (their "active")
```

Assertions are pass/fail — no per-assertion severity. Latency-based degradation is a *separate* per-monitor `degradedAfterMs` threshold that only fires when assertions pass. `timeout` (existing column) is the request-level cutoff that becomes a `down`.

Transition guard: only emit `monitor.*` events when the new status differs from `current_status`.

---

## Schema deltas (`packages/db/src/schema.ts`, migration `0012_monitor_kinds_assertions.sql`)

- New pg enum `monitor_kind`: `'http' | 'tcp' | 'dns'`.
- `monitors`:
  - `kind monitor_kind not null default 'http'`
  - `headers jsonb not null default '[]'` (shape change: `Record<string,string>` → `Array<{key,value}>`; preserves order, allows duplicates)
  - `assertions jsonb not null default '[]'`
  - `degraded_after_ms integer` (nullable; null = never degraded by latency)
  - `follow_redirects boolean not null default true`
- Keep `expected_status` for one release; backfill into a synthesized status assertion.
- Per-kind CHECK constraints (hand-written in the SQL):
  - `kind='http'` ⇒ `url is not null and method is not null`
  - `kind='tcp'`  ⇒ `host is not null and port is not null`
  - `kind='dns'`  ⇒ `host is not null`
- New nullable columns for non-HTTP: `host varchar(255)`, `port integer` (1..65535).

Migration also:
- Converts existing `headers` jsonb-record → array via `jsonb_agg(jsonb_build_object('key', k, 'value', v))`.
- Backfills `assertions` from `expected_status`: `[{ "version": "v1", "type": "status", "compare": "eq", "target": <expected_status> }]`.

---

## Shared TS module (`packages/db/src/assertions.ts`)

Zod schemas + dictionaries:

```ts
export const numberCompare = ["eq","not_eq","gt","gte","lt","lte"] as const;
export const stringCompare = ["contains","not_contains","eq","not_eq","empty","not_empty","gt","gte","lt","lte"] as const;
export const recordCompare = ["eq","not_eq","contains","not_contains"] as const;
export const dnsRecords    = ["A","AAAA","CNAME","MX","TXT","NS"] as const;

const base = z.object({ version: z.literal("v1") });
export const statusAssertion   = base.extend({ type: z.literal("status"),    compare: z.enum(numberCompare), target: z.number().int().positive() });
export const headerAssertion   = base.extend({ type: z.literal("header"),    compare: z.enum(stringCompare), key: z.string().min(1), target: z.string() });
export const textBodyAssertion = base.extend({ type: z.literal("textBody"),  compare: z.enum(stringCompare), target: z.string() });
export const jsonBodyAssertion = base.extend({ type: z.literal("jsonBody"),  compare: z.enum(stringCompare), path: z.string().min(1), target: z.string() });
export const recordAssertion   = base.extend({ type: z.literal("dnsRecord"), compare: z.enum(recordCompare), key: z.enum(dnsRecords), target: z.string() });
export const assertion = z.discriminatedUnion("type", [statusAssertion, headerAssertion, textBodyAssertion, jsonBodyAssertion, recordAssertion]);

export const numberCompareDictionary = { eq: "Equal", not_eq: "Not Equal", gt: "Greater than", gte: "Greater than or equal", lt: "Less than", lte: "Less than or equal" };
export const stringCompareDictionary = { ...numberCompareDictionary, contains: "Contains", not_contains: "Does not contain", empty: "Empty", not_empty: "Not Empty" };
export const recordCompareDictionary = { eq: "Equal", not_eq: "Not Equal", contains: "Contains", not_contains: "Does not contain" };
```

`jsonBody` is in the schema for forward-compat but no UI button until JSONPath is wired.

---

## Admin form UI (`apps/web/src/components/monitor-config-form.tsx`, new client component)

Switch from plain `<form action>` to **react-hook-form + zodResolver**. Add `react-hook-form` and `@hookform/resolvers` to `apps/web` deps.

Layout (matches `_reference/openstatus/.../form-general.tsx` 1:1, restyled with our `FormCard` primitives):

- `<FormCard>` "Monitor Configuration"
  - **Section A** — `name` (col-span-2) + `active` switch.
  - `<FormCardSeparator />`
  - **Section B** — Monitoring Type radio cards `[Globe HTTP] [Network TCP] [Server DNS]`. `disabled={!!defaultValues?.kind}` with tooltip "Monitor type cannot be changed after creation."
  - `<FormCardSeparator />` (only when kind is set)
  - **Section C** — per-kind:
    - **HTTP**: grid `col-1` Method + `col-3` URL; "Request Headers" multi-row + "Add Header"; Body textarea (POST/PUT/PATCH/DELETE only).
    - **TCP**: single "Host:Port" input + IPv4/IPv6 examples list.
    - **DNS**: single "URI" input.
  - `<FormCardSeparator />` (HTTP + DNS only)
  - **Section D — Assertions** (HTTP + DNS):
    - HTTP rows: `[type-disabled] [compare] [key?] [target] [×]`. Buttons: `+ Add Status Assertion`, `+ Add Header Assertion`, `+ Add Body Assertion`.
    - DNS rows: `[record-key-select] [compare] [target] [×]`. Button: `+ Add DNS Record Assertion`.
  - **Footer** — Learn-more link + Submit.

Separate `<FormCard>` "Response Time Thresholds": `degradedAfter` (ms, optional) + `timeout` (ms, required).

---

## Server actions (`apps/web/src/lib/actions/monitors.ts`)

- Form posts a single hidden `payload` field with `JSON.stringify(form.getValues())`.
- Action does `JSON.parse` → Zod against a master schema combining the kind picker + per-kind refinements:
  - `kind === "http"` ⇒ valid http(s) URL.
  - `kind === "tcp"`  ⇒ matches `host:port` or `[ipv6]:port`; split into `host`/`port` columns server-side.
  - `kind === "dns"`  ⇒ valid hostname.
  - Disallow assertion types outside the monitor's kind (e.g. no `header` on dns).

---

## API (`apps/api/src/routes/probes.ts`)

- `GET /v1/probes/monitors` — include `kind`, `headers` (array shape), `assertions`, `degradedAfterMs`, `followRedirects`. Return `host:port` joined as `url` for TCP, hostname as `url` for DNS (lets the Go struct stay simple).
- `POST /v1/probes/results` — schema unchanged.
- Transition logic update:
  ```
  prev != "down"     && next == "down"     → emit monitor.down
  prev == "down"     && next == "up"       → emit monitor.recovered
  prev != "degraded" && prev != "down" && next == "degraded" → emit monitor.degraded
  prev == "degraded" && next == "up"       → emit monitor.recovered
  ```

---

## Checker (`apps/checker/`) — stdlib-only

Mirror openstatus's layout, slimmed:

- `request.go` — assertion type/compare constants + raw-assertion struct.
- `assertions.go` — port `pkg/assertions/assertions.go`. `jsonBody` returns `false` (stub) until JSONPath lands.
- `prober_http.go` — current `prober.go` body, plus assertion eval against `res.Header` + body bytes. Returns `up | down | degraded` per the reduction.
- `prober_tcp.go` — `net.DialTimeout("tcp", host:port, timeout)`. Latency = dial. No assertions.
- `prober_dns.go` — `net.LookupHost` / `LookupCNAME` / `LookupMX` / `LookupNS` / `LookupTXT`, build `DnsResponse{A,AAAA,CNAME,MX,NS,TXT}`, run `recordAssertion`s.
- `runner.go` — small `runOne` dispatch on `m.Kind`.

---

## Notifications

- Add `monitor.degraded` to `eventTypeEnum` (migration appends to pg enum).
- Render case in `packages/notifications`: `:warning:` icon, "Performance degraded — `<monitor>` is responding slower than `<degradedAfterMs>` ms".
- Recovery from degraded reuses existing `monitor.recovered` event.

---

## PR slicing & checklist

### Step 1 — Schema + shared assertions module ✅

- [x] `packages/db/src/schema.ts`: add `monitor_kind` enum, columns (`kind`, `headers` array, `assertions`, `degraded_after_ms`, `follow_redirects`, `host`, `port`), `monitor.degraded` event type, per-kind CHECK.
- [x] `packages/db/drizzle/0012_monitor_kinds_assertions.sql` (hand-written): enum, columns, header-shape conversion, assertions backfill from `expected_status`, CHECK constraint.
- [x] `packages/db/drizzle/meta/_journal.json` updated.
- [x] `packages/db/src/assertions.ts`: Zod schemas + operator dictionaries + monitor-kind list.
- [x] Re-export from `packages/db/src/index.ts` and `package.json` exports.
- [x] All 9 packages typecheck.
- [x] Migration applied; existing rows backfilled. CHECK constraint verified end-to-end.
- [x] `apps/api/src/routes/probes.ts`: temporary array→map shim for the live Go checker until step 3.
- [x] `apps/web` consumers updated for nullable `url`/`method` and array-shape `headers`.

### Step 2 — Admin form rework ✅

- [x] Add deps: `react-hook-form`, `@hookform/resolvers` (web), `@radix-ui/react-switch`, `@radix-ui/react-label` (ui).
- [x] New UI primitives: `Switch`, `Tooltip`, `Form` RHF wrappers (shadcn-style).
- [x] `apps/web/src/components/monitor-config-form.tsx` (new): RHF form with kind picker (HTTP enabled, TCP/DNS coming-soon-disabled with tooltip), Method+URL grid, Headers row editor + Add Header, Body textarea (POST/PUT/PATCH/DELETE only), Assertions block with three Add buttons (Status / Header / Body), DNS variant with single Add DNS Record button, follow-redirects switch.
- [x] `apps/web/src/components/monitor-response-time-form.tsx` (new): `degradedAfterMs` + `timeoutMs` card.
- [x] Updated `apps/web/src/app/dashboard/monitors/new/page.tsx` (single config form, redirects to edit on create) and `[id]/edit/page.tsx` (config + response-time + schedule + danger-zone cards).
- [x] `apps/web/src/lib/actions/monitors.ts`: new `createMonitor` + `updateMonitorConfig` + `updateMonitorResponseTime` parse JSON `payload`. `host:port` parsed into `host`+`port` columns. `expected_status` mirrored from first `status eq <N>` assertion for back-compat.
- [x] Removed obsolete `MonitorForm` + `updateMonitorGeneral` + `parseHeadersText`.
- [x] Build succeeds; typecheck clean across all 9 packages.

### Step 3 — HTTP checker assertions + degraded transitions ✅

- [x] `apps/checker/assertions.go`: port of openstatus's `pkg/assertions` (status / header / textBody / dnsRecord evaluators; jsonBody fails loudly until JSONPath lands).
- [x] `apps/checker/api.go`: extended `Monitor` struct with `Kind`, `Host`, `Port`, `Headers []HeaderEntry`, `Assertions json.RawMessage`, `DegradedAfterMs`, `FollowRedirects`.
- [x] `apps/checker/prober.go`: assertion-driven reduction — fail any assertion → down; all pass + latency > degradedAfterMs → degraded; else up. Body read only when ≥1 body assertion configured (1 MB cap). Honors `follow_redirects`. New header-array iteration. `configHash` updated.
- [x] `apps/api/src/routes/probes.ts`: `GET /v1/probes/monitors` returns the full new shape; back-compat shim removed. `POST /v1/probes/results` transition logic now emits `monitor.degraded` (when going to degraded from up/unknown) and `monitor.recovered` from either `down` or `degraded` with a `fromStatus` payload field.
- [x] `packages/db/src/types.ts` + schema: `monitor.degraded` already in `eventTypeEnum` (step 1); TS `EventType` updated to match.
- [x] `packages/notifications/src/templates.ts`: new `MonitorDegradedPayload` and Slack render (`:warning:` orange `#fb923c`); recovery message switches between "down" and "degraded" wording.
- [x] All packages typecheck. Go vet clean. Checker rebuilt + restarted.
- [x] **End-to-end verified**: setting `degraded_after_ms=10` on a live monitor → next probe lands `status=degraded`, `monitor.degraded` event emitted with latency + threshold. Setting `degraded_after_ms=10000` → next probe lands `status=up`, `monitor.recovered` event emitted with `fromStatus=degraded, downForMs=120000`. Monitor's `current_status` tracks correctly.

### Step 4 — TCP + DNS ✅

- [x] `apps/checker/prober_tcp.go`: `net.Dialer.DialContext("tcp", host:port)`. Latency = dial time, surfaced as `latency_connect_ms`. Friendlier error messages ("timeout after N ms", "connection refused"). Latency-degradation honored.
- [x] `apps/checker/prober_dns.go`: parallel-ish `LookupIPAddr / LookupCNAME / LookupMX / LookupNS / LookupTXT` (stdlib only). Builds `dnsProbe{A,AAAA,CNAME,MX,NS,TXT}` and runs `dnsRecord` assertions. Trailing dots stripped from CNAME/MX/NS for assertion-friendliness. Latency surfaced as `latency_dns_ms`.
- [x] `apps/checker/prober.go` `dispatchProbe()`: routes by `m.Kind` (`http` / `tcp` / `dns`). Empty `kind` defaults to HTTP for back-compat. `runner.go` calls dispatch instead of probe directly.
- [x] `apps/web/src/components/monitor-config-form.tsx`: TCP and DNS radio cards now `enabled: true`; per-kind sections (Host:Port + IPv4/IPv6 examples for TCP, URI + DNS Record assertions for DNS) already wired in step 2 light up.
- [x] **End-to-end verified** with Cloudflare:
  - TCP `1.1.1.1:443` → `up` in 8 ms; flipped host to `127.0.0.1:65111` → `down` with error `"connection refused"` and `monitor.down` event.
  - DNS `one.one.one.one` with A-record `contains 1.1.1.1` assertion → `up` in 514 ms; flipped target to `9.9.9.9` → `down` with error `'DNS A: expected contains "9.9.9.9", got [1.0.0.1 1.1.1.1]'` and `monitor.down` event.
  - Transition events on both reduce paths fired correctly.

### Step 5 — Cleanup ✅

- [x] Migration `0013_drop_expected_status.sql`: drops the `expected_status` column. Recreates the `monitors_changed_upd` trigger (had to drop it first because its WHEN clause referenced the column) — and updates the WHEN clause to add `kind`, `host`, `port`, `assertions`, `degraded_after_ms`, `follow_redirects`, `retry_count`, `retry_delay_seconds` (those weren't firing pg_notify before, so config changes only propagated on the 30s refresh tick).
- [x] `packages/db/src/schema.ts`: column removed.
- [x] `packages/db/src/triggers.ts`: trigger source updated to match.
- [x] `apps/web/src/lib/actions/monitors.ts`: dropped `pickStatusTarget` + the `expectedStatus` mirror in `createMonitor` / `updateMonitorConfig`.
- [x] `apps/api/src/routes/probes.ts`: dropped `expectedStatus` from the GET selection.
- [x] `apps/checker/api.go`: dropped `ExpectedStatus` from the Monitor struct + `runner.go` configHash.
- [x] `packages/db/src/seed.ts`: dropped `expectedStatus: 200` from the four seed inserts.
- [x] Migration applied; checker rebuilt + restarted; pg_notify-driven config change verified end-to-end.

### Step 6 — Proportional bar tracker ✅

Followup tweak after first review: replaced the wrapper's `flex flex-col` + `rounded-full` with `block` + `rounded-sm`, dropped `transition-all` on segments. The pill-cap shape clipped tiny segments (e.g. a 4% degraded sliver = ~2 px) inside the curved cap region, making the boundary with the next segment land at less-than-full bar width — visually a "lean" between adjacent colors. With small-radius rounding the cap is ~2 px, so even a 2-pixel segment exits the cap immediately and adjacent segments meet flush at full width.


- [x] `apps/api/src/routes/status.ts`: extended the per-day SQL rollup to return `ok`, `degraded`, `down`, `unknown` counts. `failed` (= degraded + down) kept for back-compat. Day-level `status` rule unchanged (95% threshold).
- [x] `packages/api-client/src/index.ts`: `MonitorHistoryDay` now carries the four counts plus `failed` and `status`.
- [x] `packages/ui/src/status-tracker.tsx`: rebuilt — `buildSegments(day)` produces `[{status, height%}]` proportional to the per-status counts (worst-on-top so an outage probe stays visible). Each day renders N stacked `<div>` segments inside the rounded pill. HoverCard shows the per-status breakdown with count and percentage.
- [x] Verified end-to-end on the live `imonirulislam` page: a day with 21 ok / 1 degraded / 0 down / 22 total renders as `95.45% green + 4.55% yellow` (vs. solid red under the old single-color model). 6 success + 4 warning + 3 destructive segments emitted across the 90-day window.
- [x] All packages typecheck. `bun run --filter @openmonitor/status-page build` succeeds.

Out of scope (deliberately deferred):
- click-to-pin / keyboard-arrow nav between days
- `barType` / `cardType` admin toggles
- events-on-day in the hover card (would need an extra fetch).

---

## Open questions (carried forward)

1. **`jsonBody` UI button** — I'll keep schema, no button. Revisit when JSONPath lands.
2. **Headers shape** — converting `Record<string,string>` → `Array<{key,value}>`. One-line migration.
3. **JSONPath in Go** — defer until step 3+; for now `jsonBody` evaluator returns `false`.
4. **TCP examples** — copy openstatus's three (Domain, IPv4, IPv6) verbatim.
