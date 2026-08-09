"use client";

import { Button, Input } from "@openmonitor/ui";
import { Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type MonitorStatus = "up" | "down" | "degraded" | "unknown";

export type MonitorOption = {
  id: string;
  name: string;
  status: MonitorStatus;
};

const STATUS_DOT: Record<MonitorStatus, string> = {
  down: "bg-red-500",
  degraded: "bg-amber-500",
  unknown: "bg-muted-foreground/40",
  up: "bg-emerald-500",
};

const PAGE_SIZE = 25;
const DEBOUNCE_MS = 200;

type FetchState = {
  results: MonitorOption[];
  hasMore: boolean;
  loading: boolean;
  initialized: boolean;
  error: string | null;
};

const INITIAL_STATE: FetchState = {
  results: [],
  hasMore: false,
  loading: false,
  initialized: false,
  error: null,
};

export function MonitorMultiSelect({
  name,
  statusPageId,
  defaultSelected = [],
  emptyText = "No monitors found.",
}: {
  name: string;
  statusPageId?: string;
  defaultSelected?: MonitorOption[];
  emptyText?: string;
}) {
  const [selectedById, setSelectedById] = useState<Map<string, MonitorOption>>(
    () => new Map(defaultSelected.map((m) => [m.id, m])),
  );
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<FetchState>(INITIAL_STATE);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  // Reset paging when the query changes.
  useEffect(() => {
    setOffset(0);
  }, [debouncedQuery]);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const params = new URLSearchParams({
      q: debouncedQuery,
      offset: String(offset),
      limit: String(PAGE_SIZE),
    });
    if (statusPageId) params.set("statusPageId", statusPageId);

    fetch(`/api/monitors/search?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Search failed (${r.status})`);
        return r.json() as Promise<{ monitors: MonitorOption[]; hasMore: boolean }>;
      })
      .then((data) => {
        if (cancelled) return;
        setState((prev) => ({
          results: offset === 0 ? data.monitors : [...prev.results, ...data.monitors],
          hasMore: data.hasMore,
          loading: false,
          initialized: true,
          error: null,
        }));
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState((s) => ({ ...s, loading: false, error: err.message }));
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, offset, statusPageId]);

  const selected = useMemo(() => Array.from(selectedById.values()), [selectedById]);

  function toggle(m: MonitorOption) {
    setSelectedById((prev) => {
      const next = new Map(prev);
      if (next.has(m.id)) next.delete(m.id);
      else next.set(m.id, m);
      return next;
    });
  }

  function loadMore() {
    setOffset((o) => o + PAGE_SIZE);
  }

  return (
    <div className="flex flex-col gap-2">
      {selected.map((m) => (
        <input key={m.id} type="hidden" name={name} value={m.id} />
      ))}

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selected.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1.5 rounded border border-border bg-muted px-2 py-0.5 text-xs"
            >
              <span className={`size-1.5 rounded-full ${STATUS_DOT[m.status]}`} />
              {m.name}
              <button
                type="button"
                onClick={() => toggle(m)}
                className="-mr-0.5 ml-0.5 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${m.name}`}
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-2.5 left-2 size-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search monitors…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
        {state.loading && state.initialized ? (
          <Loader2Icon className="absolute top-2.5 right-2 size-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <div className="max-h-56 min-h-[8.5rem] overflow-y-auto rounded border border-border">
        {!state.initialized ? (
          <ul aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-1.5">
                <span className="size-4 rounded bg-muted" />
                <span className="size-1.5 rounded-full bg-muted" />
                <span
                  className="h-3 flex-1 animate-pulse rounded bg-muted"
                  style={{ maxWidth: `${60 + ((i * 13) % 30)}%` }}
                />
              </li>
            ))}
          </ul>
        ) : state.error ? (
          <p className="px-3 py-4 text-center text-destructive text-xs">{state.error}</p>
        ) : state.results.length === 0 ? (
          <p className="px-3 py-4 text-center text-muted-foreground text-xs">
            {debouncedQuery ? "No matches." : emptyText}
          </p>
        ) : (
          <div className={`transition-opacity ${state.loading ? "opacity-60" : "opacity-100"}`}>
            <ul>
              {state.results.map((m) => {
                const isSelected = selectedById.has(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => toggle(m)}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted ${
                        isSelected ? "bg-muted/60" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        tabIndex={-1}
                        className="size-4 rounded border-border"
                      />
                      <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[m.status]}`} />
                      <span className="flex-1 truncate">{m.name}</span>
                      {m.status !== "up" ? (
                        <span className="text-muted-foreground text-xs capitalize">{m.status}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            {state.hasMore ? (
              <div className="border-border border-t p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={loadMore}
                  disabled={state.loading}
                >
                  {state.loading ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
