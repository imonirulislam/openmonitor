import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

/**
 * Neon's driver carries the Postgres wire protocol over a WebSocket rather than
 * a raw TCP socket. That's the whole reason we use it: a serverless invocation
 * can open a connection, run its queries and disappear without leaving a pooled
 * socket behind, and it still gets real interactive transactions — which the
 * outbox depends on and Neon's HTTP driver cannot provide.
 *
 * Two environments have to be taught about it:
 *
 * - **Node 20** has no global WebSocket, so we hand the driver `ws`. Node 22 and
 *   the edge runtimes ship one and keep theirs.
 * - **Plain Postgres** — docker compose, CI — can't terminate a WebSocket at
 *   all. Neon publish a `wsproxy` sidecar that unwraps it and speaks TCP to
 *   Postgres; point `NEON_WS_PROXY` at that and the same driver works locally.
 *   Dev and production then exercise identical code, which matters most for the
 *   layer that is hardest to test in isolation.
 *
 * Unset `NEON_WS_PROXY` in production and the driver talks to Neon directly
 * over TLS.
 */
let configured = false;

export function configureNeon(): void {
  if (configured) return;
  configured = true;

  if (!neonConfig.webSocketConstructor) {
    neonConfig.webSocketConstructor = globalThis.WebSocket ?? (ws as unknown as typeof WebSocket);
  }

  const proxy = process.env.NEON_WS_PROXY;
  if (!proxy) return;

  neonConfig.wsProxy = () => `${proxy}/v1`;
  // The proxy is a plaintext hop on a private network. Neon's TLS pipelining
  // assumes it is talking to Neon's own endpoint and hangs against wsproxy.
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}
