import type { EventType } from "@openmonitor/db";

export type SlackBlock =
  | { type: "header"; text: { type: "plain_text"; text: string } }
  | {
      type: "section";
      text?: { type: "mrkdwn"; text: string };
      fields?: Array<{ type: "mrkdwn"; text: string }>;
    }
  | { type: "divider" }
  | {
      type: "context";
      elements: Array<{ type: "mrkdwn"; text: string }>;
    };

export type SlackMessage = {
  text: string;
  blocks: SlackBlock[];
  attachments?: Array<{ color: string; blocks: SlackBlock[] }>;
};

export type MonitorDownPayload = {
  monitor: { id: string; slug: string; name: string; url: string };
  region: string;
  error: string | null;
  statusCode: number | null;
  checkedAt: string;
};

export type MonitorRecoveredPayload = {
  monitor: { id: string; slug: string; name: string; url: string };
  region: string;
  downForMs: number | null;
  /** "down" or "degraded" — what the monitor recovered from. Older payloads omit this. */
  fromStatus?: "down" | "degraded";
  checkedAt: string;
};

export type MonitorDegradedPayload = {
  monitor: { id: string; slug: string; name: string; url: string };
  region: string;
  latencyMs: number | null;
  /** Threshold the latency exceeded; null when degraded for non-latency reasons. */
  degradedAfterMs: number | null;
  checkedAt: string;
};

export type LocationSilencePayload = {
  location: { id: string; name: string; region: string };
  /** Monitors this location was probing, used for channel routing. */
  monitorIds: string[];
  monitorNames: string[];
  lastSeenAt: string | null;
  silentForMs: number | null;
};

export type IncidentPayload = {
  incident: {
    id: string;
    title: string;
    status: "investigating" | "identified" | "monitoring" | "resolved";
    severity: "minor" | "major" | "critical";
  };
  monitorNames: string[];
  message?: string;
  url?: string;
};

export type MaintenancePayload = {
  maintenance: { id: string; title: string; description: string | null };
  monitorNames: string[];
  startsAt: string;
  endsAt: string;
  url?: string;
};

const SEVERITY_COLOR: Record<string, string> = {
  minor: "#facc15",
  major: "#fb923c",
  critical: "#ef4444",
};

const STATUS_EMOJI: Record<string, string> = {
  investigating: ":mag:",
  identified: ":pushpin:",
  monitoring: ":eyes:",
  resolved: ":white_check_mark:",
};

export function renderSlackMessage(
  type: EventType,
  payload: Record<string, unknown>,
): SlackMessage {
  switch (type) {
    case "monitor.down":
      return monitorDown(payload as unknown as MonitorDownPayload);
    case "monitor.degraded":
      return monitorDegraded(payload as unknown as MonitorDegradedPayload);
    case "monitor.recovered":
      return monitorRecovered(payload as unknown as MonitorRecoveredPayload);
    case "incident.created":
    case "incident.updated":
    case "incident.resolved":
      return incidentMessage(type, payload as unknown as IncidentPayload);
    case "location.silent":
      return locationSilent(payload as unknown as LocationSilencePayload);
    case "location.recovered":
      return locationRecovered(payload as unknown as LocationSilencePayload);
    case "maintenance.scheduled":
    case "maintenance.started":
    case "maintenance.ended":
      return maintenanceMessage(type, payload as unknown as MaintenancePayload);
    default: {
      const exhaustive: never = type;
      throw new Error(`Unhandled event type: ${exhaustive as string}`);
    }
  }
}

function monitorDown(p: MonitorDownPayload): SlackMessage {
  const text = `:rotating_light: ${p.monitor.name} is DOWN`;
  return {
    text,
    blocks: [],
    attachments: [
      {
        color: "#ef4444",
        blocks: [
          { type: "header", text: { type: "plain_text", text } },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Service*\n${p.monitor.name}` },
              { type: "mrkdwn", text: `*URL*\n<${p.monitor.url}>` },
              { type: "mrkdwn", text: `*Region*\n${p.region}` },
              {
                type: "mrkdwn",
                text: `*Status code*\n${p.statusCode ?? "—"}`,
              },
            ],
          },
          ...(p.error
            ? [
                {
                  type: "section" as const,
                  text: { type: "mrkdwn" as const, text: `*Error*\n\`${p.error}\`` },
                },
              ]
            : []),
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: `Detected at ${p.checkedAt}` }],
          },
        ],
      },
    ],
  };
}

function monitorDegraded(p: MonitorDegradedPayload): SlackMessage {
  const text = `:warning: ${p.monitor.name} performance degraded`;
  const threshold = p.degradedAfterMs != null ? `${p.degradedAfterMs} ms` : "—";
  const observed = p.latencyMs != null ? `${p.latencyMs} ms` : "—";
  return {
    text,
    blocks: [],
    attachments: [
      {
        color: "#fb923c",
        blocks: [
          { type: "header", text: { type: "plain_text", text } },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Service*\n${p.monitor.name}` },
              { type: "mrkdwn", text: `*URL*\n<${p.monitor.url}>` },
              { type: "mrkdwn", text: `*Region*\n${p.region}` },
              { type: "mrkdwn", text: `*Latency*\n${observed} (threshold ${threshold})` },
            ],
          },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: `Detected at ${p.checkedAt}` }],
          },
        ],
      },
    ],
  };
}

function monitorRecovered(p: MonitorRecoveredPayload): SlackMessage {
  const wasDegraded = p.fromStatus === "degraded";
  const text = wasDegraded
    ? `:white_check_mark: ${p.monitor.name} performance restored`
    : `:white_check_mark: ${p.monitor.name} has recovered`;
  const elapsedLabel = wasDegraded ? "Degraded for" : "Down for";
  const elapsed = p.downForMs ? `${Math.round(p.downForMs / 1000)}s` : "—";
  return {
    text,
    blocks: [],
    attachments: [
      {
        color: "#22c55e",
        blocks: [
          { type: "header", text: { type: "plain_text", text } },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Service*\n${p.monitor.name}` },
              { type: "mrkdwn", text: `*${elapsedLabel}*\n${elapsed}` },
              { type: "mrkdwn", text: `*Region*\n${p.region}` },
              { type: "mrkdwn", text: `*Recovered at*\n${p.checkedAt}` },
            ],
          },
        ],
      },
    ],
  };
}

function incidentMessage(type: EventType, p: IncidentPayload): SlackMessage {
  const emoji = STATUS_EMOJI[p.incident.status] ?? ":bell:";
  const verb =
    type === "incident.created" ? "opened" : type === "incident.resolved" ? "resolved" : "updated";
  const text = `${emoji} Incident ${verb}: ${p.incident.title}`;
  const fields: Array<{ type: "mrkdwn"; text: string }> = [
    { type: "mrkdwn", text: `*Status*\n${p.incident.status}` },
    { type: "mrkdwn", text: `*Severity*\n${p.incident.severity}` },
  ];
  if (p.monitorNames.length > 0) {
    fields.push({
      type: "mrkdwn",
      text: `*Affected*\n${p.monitorNames.join(", ")}`,
    });
  }
  return {
    text,
    blocks: [],
    attachments: [
      {
        color:
          type === "incident.resolved"
            ? "#22c55e"
            : (SEVERITY_COLOR[p.incident.severity] ?? "#64748b"),
        blocks: [
          { type: "header", text: { type: "plain_text", text } },
          { type: "section", fields },
          ...(p.message
            ? [
                {
                  type: "section" as const,
                  text: { type: "mrkdwn" as const, text: p.message },
                },
              ]
            : []),
          ...(p.url
            ? [
                {
                  type: "context" as const,
                  elements: [{ type: "mrkdwn" as const, text: `<${p.url}|View incident>` }],
                },
              ]
            : []),
        ],
      },
    ],
  };
}

function maintenanceMessage(type: EventType, p: MaintenancePayload): SlackMessage {
  const verb =
    type === "maintenance.scheduled"
      ? "scheduled"
      : type === "maintenance.started"
        ? "started"
        : "ended";
  const text = `:wrench: Maintenance ${verb}: ${p.maintenance.title}`;
  return {
    text,
    blocks: [],
    attachments: [
      {
        color: "#3b82f6",
        blocks: [
          { type: "header", text: { type: "plain_text", text } },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Starts*\n${p.startsAt}` },
              { type: "mrkdwn", text: `*Ends*\n${p.endsAt}` },
              ...(p.monitorNames.length > 0
                ? [
                    {
                      type: "mrkdwn" as const,
                      text: `*Affected*\n${p.monitorNames.join(", ")}`,
                    },
                  ]
                : []),
            ],
          },
          ...(p.maintenance.description
            ? [
                {
                  type: "section" as const,
                  text: { type: "mrkdwn" as const, text: p.maintenance.description },
                },
              ]
            : []),
        ],
      },
    ],
  };
}

/** Duration in ms as a compact human string. */
function elapsed(ms: number | null): string {
  if (ms === null || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`;
}

/**
 * A probe location stopped reporting. Deliberately amber rather than the red
 * used for monitor.down: the monitored service may be perfectly healthy — what
 * broke is our ability to observe it from this region.
 */
function locationSilent(p: LocationSilencePayload): SlackMessage {
  const text = `:satellite_antenna: Probe location ${p.location.name} stopped reporting`;
  return {
    text,
    blocks: [],
    attachments: [
      {
        color: "#f59e0b",
        blocks: [
          { type: "header", text: { type: "plain_text", text } },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Region*\n${p.location.region}` },
              { type: "mrkdwn", text: `*Silent for*\n${elapsed(p.silentForMs)}` },
              { type: "mrkdwn", text: `*Last seen*\n${p.lastSeenAt ?? "never"}` },
              {
                type: "mrkdwn",
                text: `*Monitors affected*\n${p.monitorNames.length > 0 ? p.monitorNames.join(", ") : "none"}`,
              },
            ],
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Results from this region have stopped. Status shown for these monitors now reflects the remaining regions only.",
            },
          },
        ],
      },
    ],
  };
}

function locationRecovered(p: LocationSilencePayload): SlackMessage {
  const text = `:satellite_antenna: Probe location ${p.location.name} is reporting again`;
  return {
    text,
    blocks: [],
    attachments: [
      {
        color: "#22c55e",
        blocks: [
          { type: "header", text: { type: "plain_text", text } },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Region*\n${p.location.region}` },
              { type: "mrkdwn", text: `*Was silent for*\n${elapsed(p.silentForMs)}` },
            ],
          },
        ],
      },
    ],
  };
}
