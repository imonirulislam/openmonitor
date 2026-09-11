"use client";

import { ApiClient, type MonitorHistory } from "@openmonitor/api-client";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? (typeof window !== "undefined" ? window.location.origin : "");

/** Which status page the refetch should resolve — the same identifiers the server used. */
export type HistoryScope = {
  workspace?: string;
  page?: string;
  host?: string;
  unlock?: string;
};

/** Null while the batch is in flight; undefined outside a provider. */
const HistoriesContext = createContext<Map<string, MonitorHistory> | null | undefined>(undefined);

function browserTz(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function client(): ApiClient {
  return new ApiClient({ baseUrl: PUBLIC_API_URL });
}

/**
 * Refetches every monitor's history in the browser's timezone with one
 * request, for pages that list more than one.
 */
export function LocalTzHistories({
  slugs,
  serverTz,
  scope,
  children,
}: {
  slugs: string[];
  serverTz: string;
  scope?: HistoryScope;
  children: ReactNode;
}) {
  const [histories, setHistories] = useState<Map<string, MonitorHistory> | null>(null);
  // Props from a server component are new objects on every render; key the
  // effect on their contents instead.
  const key = slugs.join(",");
  const scopeKey = JSON.stringify(scope ?? {});

  useEffect(() => {
    const tz = browserTz();
    if (!tz || tz === serverTz || key === "") return;
    let cancelled = false;
    client()
      .getMonitorHistories(key.split(","), {
        days: 90,
        tz,
        ...(JSON.parse(scopeKey) as HistoryScope),
      })
      .then((list) => {
        if (!cancelled) setHistories(new Map(list.map((h) => [h.monitor.slug, h])));
      })
      .catch((err) => console.error("history refetch failed:", err));
    return () => {
      cancelled = true;
    };
  }, [key, scopeKey, serverTz]);

  return <HistoriesContext.Provider value={histories}>{children}</HistoriesContext.Provider>;
}

/**
 * Returns a MonitorHistory bucketed in the browser's IANA timezone.
 *
 * Under a `LocalTzHistories` provider this reads the shared batch; on its own
 * it refetches the single monitor. Either way the SSR-fetched (UTC) history
 * renders until the swap, and no request happens if the TZ already matches.
 */
export function useLocalTzHistory(
  slug: string,
  initial: MonitorHistory,
  scope?: HistoryScope,
): MonitorHistory {
  const shared = useContext(HistoriesContext);
  const managed = shared !== undefined;
  const [own, setOwn] = useState(initial);
  const scopeKey = JSON.stringify(scope ?? {});

  useEffect(() => {
    if (managed) return;
    const tz = browserTz();
    if (!tz || tz === initial.tz) return;
    let cancelled = false;
    client()
      .getMonitorHistory(slug, { days: 90, tz, ...(JSON.parse(scopeKey) as HistoryScope) })
      .then((h) => {
        if (!cancelled) setOwn(h);
      })
      .catch((err) => console.error("history refetch failed:", err));
    return () => {
      cancelled = true;
    };
  }, [managed, slug, initial.tz, scopeKey]);

  return useMemo(
    () => (managed ? (shared?.get(slug) ?? initial) : own),
    [managed, shared, slug, initial, own],
  );
}
