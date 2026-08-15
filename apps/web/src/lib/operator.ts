/**
 * Instance operators — whoever runs this deployment.
 *
 * Workspace roles cannot express this. `session.user.role` is read from
 * `workspace_members`, so "admin" means admin *of one tenant*, and a deployment
 * has as many admins as it has workspaces. Anything that is deployment-wide
 * infrastructure — shared probe locations, most obviously — therefore needs a
 * gate that a tenant cannot grant itself by creating a workspace.
 *
 * The allowlist lives in the environment because the environment is controlled
 * by whoever controls the deploy, which is the same person who owns the probe
 * fleet. There is deliberately no UI for editing it: the highest privilege in
 * the system should not be reachable from inside the application.
 *
 * With `OPERATOR_EMAILS` unset nobody is an operator and shared locations are
 * read-only. That is the safe default — a fresh deployment cannot have one
 * tenant quietly take over the fleet — but it does mean a single-workspace
 * self-host has to set it before managing the seeded locations.
 */
export function operatorEmails(): string[] {
  return (process.env.OPERATOR_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isOperator(email: string | null | undefined): boolean {
  if (!email) return false;
  return operatorEmails().includes(email.toLowerCase());
}
