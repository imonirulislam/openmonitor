import { zValidator } from "@hono/zod-validator";
import { verifyPassword } from "@openmonitor/auth/password";
import { db } from "@openmonitor/db";
import { Hono } from "hono";
import { z } from "zod";
import { resolveStatusPage } from "../lib/resolve-page";
import { mintUnlockToken } from "../lib/unlock-token";

export const unlockRoutes = new Hono();

const unlockSchema = z.object({
  workspace: z.string().optional(),
  page: z.string().default("default"),
  host: z.string().optional(),
  password: z.string().min(1).max(200),
});

/**
 * Verify a status-page password and mint an unlock token. The status-page
 * front-end sets the returned token as a cookie and forwards it on
 * subsequent calls to /v1/status.
 */
unlockRoutes.post("/v1/pages/unlock", zValidator("json", unlockSchema), async (c) => {
  const body = c.req.valid("json");
  const conn = db();
  const page = await resolveStatusPage(conn, body.workspace, body.page, body.host);
  if (!page || !page.isPublic) return c.json({ error: "page not found" }, 404);
  if (!page.passwordHash) {
    // No password configured — return a token anyway so the front-end can
    // skip the unlock UX, but mark it as unprotected.
    return c.json({ ok: true, protected: false, token: mintUnlockToken(page.id) });
  }

  const ok = await verifyPassword(page.passwordHash, body.password);
  if (!ok) return c.json({ ok: false }, 401);

  return c.json({ ok: true, protected: true, token: mintUnlockToken(page.id) });
});
