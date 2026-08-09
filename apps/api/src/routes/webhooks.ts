import { Hono } from "hono";
import { and, db, eq, schema } from "@openmonitor/db";
import { env } from "../env";
import { verifySlackSignature } from "../lib/slack-signature";

export const webhookRoutes = new Hono();

/**
 * Slack endpoint for slash commands and event subscriptions.
 *
 * Signature verification is mandatory: when SLACK_SIGNING_SECRET is unset, we
 * reject everything rather than silently trust requests. When it is set, we
 * compute HMAC-SHA256 over `v0:<timestamp>:<raw body>` and compare to
 * `x-slack-signature`.
 *
 * Currently supports the read-only `/status` slash command. Write commands
 * (open/update/resolve incident) are deferred — they need a Slack-team to
 * OpenMonitor-workspace mapping that doesn't exist yet.
 */
webhookRoutes.post("/webhooks/slack", async (c) => {
  if (!env.SLACK_SIGNING_SECRET) {
    return c.json({ error: "slack webhook not configured" }, 503);
  }

  // Read raw body for signature; we'll parse form fields separately below.
  const rawBody = await c.req.text();
  const ok = verifySlackSignature({
    signingSecret: env.SLACK_SIGNING_SECRET,
    signature: c.req.header("x-slack-signature"),
    timestamp: c.req.header("x-slack-request-timestamp"),
    rawBody,
  });
  if (!ok) return c.json({ error: "invalid signature" }, 401);

  // Slack slash commands and interactive payloads arrive as
  // application/x-www-form-urlencoded.
  const params = new URLSearchParams(rawBody);
  const command = params.get("command") ?? "";
  const text = (params.get("text") ?? "").trim();

  if (command === "/status") {
    return c.json(await renderStatusReply(text));
  }

  // Unknown command — respond with usage instead of 4xx so Slack shows the
  // message to the calling user.
  return c.json({
    response_type: "ephemeral",
    text: `Unknown command \`${command}\`. Try \`/status\`.`,
  });
});

/**
 * Build a Slack message describing current status. With no argument, summarizes
 * all monitors. With a single arg matching a monitor slug, returns just that
 * monitor.
 */
async function renderStatusReply(arg: string) {
  const conn = db();

  // Without a Slack-team-to-workspace mapping we don't know which workspace
  // to query. For now, only respond when there's exactly one workspace —
  // matches the original "single-tenant" deployment shape.
  const workspaces = await conn
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .limit(2);
  if (workspaces.length !== 1) {
    return {
      response_type: "ephemeral",
      text: "Status command isn't configured for multi-workspace deployments yet.",
    };
  }
  const workspace = workspaces[0];
  if (!workspace) {
    return { response_type: "ephemeral", text: "No workspace configured." };
  }

  if (arg) {
    const [m] = await conn
      .select({
        slug: schema.monitors.slug,
        name: schema.monitors.name,
        currentStatus: schema.monitors.currentStatus,
        lastCheckedAt: schema.monitors.lastCheckedAt,
      })
      .from(schema.monitors)
      .where(
        and(eq(schema.monitors.workspaceId, workspace.id), eq(schema.monitors.slug, arg)),
      )
      .limit(1);
    if (!m) {
      return {
        response_type: "ephemeral",
        text: `No monitor with slug \`${arg}\`.`,
      };
    }
    return {
      response_type: "ephemeral",
      text: `*${m.name}* — ${statusEmoji(m.currentStatus)} \`${m.currentStatus}\` (last checked ${m.lastCheckedAt?.toISOString() ?? "never"})`,
    };
  }

  const monitors = await conn
    .select({
      slug: schema.monitors.slug,
      name: schema.monitors.name,
      currentStatus: schema.monitors.currentStatus,
    })
    .from(schema.monitors)
    .where(
      and(
        eq(schema.monitors.workspaceId, workspace.id),
        eq(schema.monitors.enabled, true),
      ),
    );

  const lines = monitors.map(
    (m) => `${statusEmoji(m.currentStatus)} *${m.name}* — \`${m.currentStatus}\``,
  );
  return {
    response_type: "ephemeral",
    text: lines.length > 0 ? lines.join("\n") : "No monitors configured.",
  };
}

function statusEmoji(status: string): string {
  if (status === "up") return ":white_check_mark:";
  if (status === "down") return ":red_circle:";
  if (status === "degraded") return ":warning:";
  return ":grey_question:";
}
