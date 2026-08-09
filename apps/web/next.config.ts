import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Load workspace-root .env so monorepo apps share a single env file.
loadEnv({ path: path.resolve(import.meta.dirname, "../../.env") });

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@openmonitor/ui", "@openmonitor/auth", "@openmonitor/db"],
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default config;
