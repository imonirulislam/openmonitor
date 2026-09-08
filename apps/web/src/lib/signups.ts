/**
 * Opt-in: a self-hosted deployment shouldn't let a stranger add a workspace.
 *
 * Not in actions/signup.ts because every export of a "use server" module has
 * to be an async function, and this is a plain predicate.
 */
export function signupsEnabled(): boolean {
  return process.env.SIGNUPS_ENABLED === "on";
}
