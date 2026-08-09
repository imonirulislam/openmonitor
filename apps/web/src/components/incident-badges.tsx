import { Badge } from "@openmonitor/ui";
import type { ComponentProps } from "react";

type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
type IncidentSeverity = "minor" | "major" | "critical";

type BadgeVariant = ComponentProps<typeof Badge>["variant"];

// Status → variant mapping mirrored from openstatus (investigating=red,
// identified=amber, monitoring=blue, resolved=green). Keeps the lifecycle
// colors consistent across overview panels, list tables, and detail pages.
const STATUS_VARIANT: Record<IncidentStatus, BadgeVariant> = {
  investigating: "destructive",
  identified: "warning",
  monitoring: "info",
  resolved: "success",
};

const SEVERITY_VARIANT: Record<IncidentSeverity, BadgeVariant> = {
  critical: "destructive",
  major: "warning",
  minor: "default",
};

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}

export function IncidentSeverityBadge({ severity }: { severity: IncidentSeverity }) {
  return <Badge variant={SEVERITY_VARIANT[severity]}>{severity}</Badge>;
}
