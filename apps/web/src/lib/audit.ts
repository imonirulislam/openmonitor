import { db, schema } from "@openmonitor/db";
import { auth } from "~/auth";

export type AuditTarget = "monitor" | "incident" | "maintenance" | "channel" | "user";

/**
 * logAudit — write a row to audit_logs from a server action.
 *
 * Captures actor (from session), action verb, target type/id, and a
 * human-readable label so the audit-logs page renders without joining.
 * Metadata is for ad-hoc detail (e.g. before/after diffs); keep it small.
 *
 * Workspace is taken from the session's currentWorkspaceId. If no session is
 * bound (shouldn't happen because callers go through requireEditor first) we
 * skip the write — better an audit gap than a foreign-key violation crashing
 * the primary action.
 *
 * Logging is best-effort: if the write fails we swallow the error so the
 * primary action still succeeds. Audit gaps beat broken business logic.
 */
export async function logAudit(args: {
  action: string;
  targetType: AuditTarget;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user?.workspaceId) return;
    await db().insert(schema.auditLogs).values({
      workspaceId: session.user.workspaceId,
      actorId: session.user.id ?? null,
      actorEmail: session.user.email ?? null,
      action: args.action,
      targetType: args.targetType,
      targetId: args.targetId ?? null,
      targetLabel: args.targetLabel ?? null,
      metadata: args.metadata ?? null,
    });
  } catch (err) {
    console.error("audit log failed:", err);
  }
}
