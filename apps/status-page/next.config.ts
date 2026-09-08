import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

loadEnv({ path: path.resolve(import.meta.dirname, "../../.env") });

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@openmonitor/ui", "@openmonitor/api-client"],
  // See apps/marketing/next.config.ts — traced files live above this app.
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
};

export default config;
