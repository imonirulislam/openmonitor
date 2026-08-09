import { z } from "zod";

/**
 * Assertion shapes for monitor probes. Modeled on openstatus's `@openstatus/assertions`
 * (`_reference/openstatus/packages/assertions/src/v1.ts`). Each assertion is pass/fail —
 * there is no per-assertion severity. Latency-based degradation lives on the monitor
 * itself as `degraded_after_ms`.
 *
 * The Go checker (`apps/checker`) decodes these as `json.RawMessage` and dispatches on
 * the `type` field; keep field names + value sets in lockstep with `apps/checker/request.go`
 * and `apps/checker/assertions.go`.
 */

export const numberCompare = ["eq", "not_eq", "gt", "gte", "lt", "lte"] as const;
export const stringCompare = [
  "contains",
  "not_contains",
  "eq",
  "not_eq",
  "empty",
  "not_empty",
  "gt",
  "gte",
  "lt",
  "lte",
] as const;
export const recordCompare = ["eq", "not_eq", "contains", "not_contains"] as const;
export const dnsRecords = ["A", "AAAA", "CNAME", "MX", "TXT", "NS"] as const;

export type NumberCompare = (typeof numberCompare)[number];
export type StringCompare = (typeof stringCompare)[number];
export type RecordCompare = (typeof recordCompare)[number];
export type DnsRecord = (typeof dnsRecords)[number];

const base = z.object({ version: z.literal("v1") });

export const statusAssertion = base.extend({
  type: z.literal("status"),
  compare: z.enum(numberCompare),
  target: z.number().int().positive(),
});

export const headerAssertion = base.extend({
  type: z.literal("header"),
  compare: z.enum(stringCompare),
  key: z.string().min(1),
  target: z.string(),
});

export const textBodyAssertion = base.extend({
  type: z.literal("textBody"),
  compare: z.enum(stringCompare),
  target: z.string(),
});

export const jsonBodyAssertion = base.extend({
  type: z.literal("jsonBody"),
  compare: z.enum(stringCompare),
  path: z.string().min(1),
  target: z.string(),
});

export const recordAssertion = base.extend({
  type: z.literal("dnsRecord"),
  compare: z.enum(recordCompare),
  key: z.enum(dnsRecords),
  target: z.string(),
});

export const assertion = z.discriminatedUnion("type", [
  statusAssertion,
  headerAssertion,
  textBodyAssertion,
  jsonBodyAssertion,
  recordAssertion,
]);

export type StatusAssertion = z.infer<typeof statusAssertion>;
export type HeaderAssertion = z.infer<typeof headerAssertion>;
export type TextBodyAssertion = z.infer<typeof textBodyAssertion>;
export type JsonBodyAssertion = z.infer<typeof jsonBodyAssertion>;
export type RecordAssertion = z.infer<typeof recordAssertion>;
export type Assertion = z.infer<typeof assertion>;

// Operator labels surfaced in the admin form UI. Mirrors openstatus's
// `numberCompareDictionary` / `stringCompareDictionary` / `recordCompareDictionary`.
export const numberCompareDictionary: Record<NumberCompare, string> = {
  eq: "Equal",
  not_eq: "Not Equal",
  gt: "Greater than",
  gte: "Greater than or equal",
  lt: "Less than",
  lte: "Less than or equal",
};

export const stringCompareDictionary: Record<StringCompare, string> = {
  contains: "Contains",
  not_contains: "Does not contain",
  eq: "Equal",
  not_eq: "Not Equal",
  empty: "Empty",
  not_empty: "Not Empty",
  gt: "Greater than",
  gte: "Greater than or equal",
  lt: "Less than",
  lte: "Less than or equal",
};

export const recordCompareDictionary: Record<RecordCompare, string> = {
  eq: "Equal",
  not_eq: "Not Equal",
  contains: "Contains",
  not_contains: "Does not contain",
};

export const monitorKinds = ["http", "tcp", "dns"] as const;
export type MonitorKind = (typeof monitorKinds)[number];

export const headerEntry = z.object({
  key: z.string(),
  value: z.string(),
});
export type HeaderEntry = z.infer<typeof headerEntry>;
