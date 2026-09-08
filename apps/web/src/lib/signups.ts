/**
 * Opt-in: a self-hosted deployment shouldn't let a stranger add a workspace.
 *
 * Accepts on/true/1/yes rather than just "on". A flag that silently keeps
 * signups closed because someone wrote `true` is worse than a strict one —
 * there's nothing to see, and no error to search for.
 *
 * Not in actions/signup.ts because every export of a "use server" module has
 * to be an async function, and this is a plain predicate.
 */
const TRUTHY = new Set(["on", "true", "1", "yes"]);

export function signupsEnabled(): boolean {
  return TRUTHY.has((process.env.SIGNUPS_ENABLED ?? "").trim().toLowerCase());
}
