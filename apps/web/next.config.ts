import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Load workspace-root .env so monorepo apps share a single env file.
loadEnv({ path: path.resolve(import.meta.dirname, "../../.env") });

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@openmonitor/ui",
    "@openmonitor/auth",
    "@openmonitor/db",
    "@openmonitor/clickhouse",
  ],
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
    // Barrel imports rewritten to direct ones; keeps recharts out of routes
    // that don't chart anything.
    optimizePackageImports: ["@openmonitor/ui"],
  },
  // See apps/marketing/next.config.ts — traced files live above this app.
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  // The app used to live under /dashboard, which read as
  // dashboard.example.com/dashboard/monitors. Routes are at the root now;
  // keep the old paths working for anything already bookmarked.
  async redirects() {
    return [
      { source: "/dashboard", destination: "/", permanent: true },
      { source: "/dashboard/:path*", destination: "/:path*", permanent: true },
    ];
  },
};

export default config;
