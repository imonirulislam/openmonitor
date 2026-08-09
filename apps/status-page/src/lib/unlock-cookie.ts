/**
 * Cookie name used to store the unlock token for a specific (workspace, page,
 * host) combo. We key on all three so a visitor unlocking page A doesn't
 * accidentally also gain access to page B in the same browser.
 *
 * The value is a hash-style string so the cookie name stays under the 4KB
 * total cookie budget even with long workspace/page slugs and custom domains.
 */
export function unlockCookieName(params: {
  workspace?: string;
  page?: string;
  host?: string;
}): string {
  const key = [params.host ?? "", params.workspace ?? "", params.page ?? ""]
    .join("|")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  return `openmonitor_unlock_${key}`;
}
