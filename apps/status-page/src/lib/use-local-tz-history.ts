"use client";

import { ApiClient, type MonitorHistory } from "@openmonitor/api-client";
import { useEffect, useState } from "react";

const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? (typeof window !== "undefined" ? window.location.origin : "");

/**
 * Returns a MonitorHistory bucketed in the browser's IANA timezone.
 *
 * Initial value is the SSR-fetched (UTC) history; on mount, refetches with
 * the user's timezone and swaps in. Skips the network call if the SSR data
 * is already in the right TZ (e.g. user is in UTC).
 */
export function useLocalTzHistory(slug: string, initial: MonitorHistory): MonitorHistory {
  const [history, setHistory] = useState(initial);

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || tz === initial.tz) return;
    const client = new ApiClient({ baseUrl: PUBLIC_API_URL });
    client
      .getMonitorHistory(slug, { days: 90, tz })
      .then(setHistory)
      .catch((err) => console.error("history refetch failed:", err));
  }, [slug, initial.tz]);

  return history;
}
