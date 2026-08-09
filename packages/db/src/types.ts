import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type {
  auditLogs,
  events,
  incidents,
  incidentUpdates,
  maintenances,
  monitorRegionStatus,
  monitorRuns,
  monitors,
  notificationChannels,
  probeLocationMonitors,
  probeLocations,
  statusPages,
  users,
  workspaceMembers,
  workspaces,
} from "./schema";

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type Workspace = InferSelectModel<typeof workspaces>;
export type NewWorkspace = InferInsertModel<typeof workspaces>;

export type WorkspaceMember = InferSelectModel<typeof workspaceMembers>;
export type NewWorkspaceMember = InferInsertModel<typeof workspaceMembers>;

export type StatusPage = InferSelectModel<typeof statusPages>;
export type NewStatusPage = InferInsertModel<typeof statusPages>;

export type Monitor = InferSelectModel<typeof monitors>;
export type NewMonitor = InferInsertModel<typeof monitors>;

export type MonitorRun = InferSelectModel<typeof monitorRuns>;
export type NewMonitorRun = InferInsertModel<typeof monitorRuns>;

export type MonitorRegionStatus = InferSelectModel<typeof monitorRegionStatus>;
export type NewMonitorRegionStatus = InferInsertModel<typeof monitorRegionStatus>;

export type ProbeLocation = InferSelectModel<typeof probeLocations>;
export type NewProbeLocation = InferInsertModel<typeof probeLocations>;

export type ProbeLocationMonitor = InferSelectModel<typeof probeLocationMonitors>;
export type NewProbeLocationMonitor = InferInsertModel<typeof probeLocationMonitors>;

export type Incident = InferSelectModel<typeof incidents>;
export type NewIncident = InferInsertModel<typeof incidents>;

export type IncidentUpdate = InferSelectModel<typeof incidentUpdates>;
export type NewIncidentUpdate = InferInsertModel<typeof incidentUpdates>;

export type Maintenance = InferSelectModel<typeof maintenances>;
export type NewMaintenance = InferInsertModel<typeof maintenances>;

export type NotificationChannel = InferSelectModel<typeof notificationChannels>;
export type NewNotificationChannel = InferInsertModel<typeof notificationChannels>;

export type EventRecord = InferSelectModel<typeof events>;
export type NewEvent = InferInsertModel<typeof events>;

export type AuditLog = InferSelectModel<typeof auditLogs>;
export type NewAuditLog = InferInsertModel<typeof auditLogs>;

export type UserRole = "admin" | "editor" | "viewer";
export type MonitorStatus = "up" | "down" | "degraded" | "unknown";
export type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
export type IncidentSeverity = "minor" | "major" | "critical";
export type MaintenanceStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type EventType =
  | "monitor.down"
  | "monitor.recovered"
  | "monitor.degraded"
  | "incident.created"
  | "incident.updated"
  | "incident.resolved"
  | "maintenance.scheduled"
  | "maintenance.started"
  | "maintenance.ended";
