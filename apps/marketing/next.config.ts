import type { NextConfig } from "next";

/**
 * No dotenv loading and no DATABASE_URL. The marketing site talks to nothing —
 * it's static pages plus links — so it stays deployable when everything else is
 * down, which is the one job a marketing site has during an incident.
 */
const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@openmonitor/ui"],
};

export default config;
