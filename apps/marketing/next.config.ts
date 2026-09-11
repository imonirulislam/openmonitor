import path from "node:path";
import type { NextConfig } from "next";

/**
 * No dotenv loading and no DATABASE_URL. The marketing site talks to nothing —
 * it's static pages plus links — so it stays deployable when everything else is
 * down, which is the one job a marketing site has during an incident.
 */
const config: NextConfig = {
  reactStrictMode: true,
  experimental: { optimizePackageImports: ["@openmonitor/ui"] },
  transpilePackages: ["@openmonitor/ui"],
  // Traced server files resolve into the workspace-root node_modules, above
  // this app. Without this the trace paths are relative to apps/marketing, and
  // `vercel deploy --prebuilt` fails on the ones that escape it: "Please ensure
  // project dependencies have been installed".
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
};

export default config;
