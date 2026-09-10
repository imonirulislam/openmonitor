"use client";

import { getRegionInfo } from "@openmonitor/regions";
import {
  Badge,
  Button,
  Checkbox,
  cn,
  LocalTime,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@openmonitor/ui";
import { useState } from "react";
import { RowActionAction, RowActions } from "~/components/row-actions";
import {
  deleteProbeLocation,
  rotateProbeLocationToken,
  setProbeLocationEnabled,
  setProbeLocationMonitors,
} from "~/lib/actions/probe-locations";

/** Provider tag. A guess from the region code renders greyed, not as fact. */
function ProviderTag({
  region,
  name,
  provider,
}: {
  region: string;
  name: string;
  provider: string | null;
}) {
  const guessed = getRegionInfo(region, { label: name }).provider;
  const value = provider ?? guessed;
  if (value === "private") return null;
  const isGuess = !provider;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "cursor-default rounded px-1 py-0.5 font-mono text-[10px]",
            isGuess ? "bg-muted/60 text-muted-foreground/70" : "bg-muted text-foreground",
          )}
        >
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {isGuess
          ? `Guessed from the region code. Set a provider if this box isn't on ${value}.`
          : `Provider: ${value}`}
      </TooltipContent>
    </Tooltip>
  );
}

export interface ProbeLocationRow {
  id: string;
  name: string;
  region: string;
  /** Operator-declared; null falls back to the catalogue's guess. */
  provider: string | null;
  enabled: boolean;
  lastSeenAt: Date | null;
  /** Operator-owned and offered to every workspace. */
  shared: boolean;
  /** Whether the signed-in user may enable/rotate/delete this location. */
  canManage: boolean;
  monitorIds: string[];
}

export interface MonitorOption {
  id: string;
  name: string;
  slug: string;
}

/** A location that has never reported can't be distinguished from a dead one. */
function LastSeen({ at }: { at: Date | null }) {
  if (!at) return <span className="text-muted-foreground text-xs">never</span>;
  const stale = Date.now() - at.getTime() > 10 * 60_000;
  return (
    <span className={stale ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>
      <LocalTime date={at} />
      {stale ? " (stale)" : null}
    </span>
  );
}

function MonitorAssignment({
  location,
  monitors,
}: {
  location: ProbeLocationRow;
  monitors: MonitorOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(location.monitorIds));
  const [open, setOpen] = useState(false);

  const dirty =
    selected.size !== location.monitorIds.length ||
    location.monitorIds.some((id) => !selected.has(id));

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {location.monitorIds.length} monitor{location.monitorIds.length === 1 ? "" : "s"}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
      {monitors.length === 0 ? (
        <p className="text-muted-foreground text-xs">No monitors in this workspace yet.</p>
      ) : (
        monitors.map((m) => (
          <label key={m.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.has(m.id)}
              onCheckedChange={(checked) => {
                const next = new Set(selected);
                if (checked) next.add(m.id);
                else next.delete(m.id);
                setSelected(next);
              }}
            />
            <span>{m.name}</span>
            <span className="text-muted-foreground text-xs">{m.slug}</span>
          </label>
        ))
      )}
      <div className="mt-1 flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!dirty}
          onClick={() => setProbeLocationMonitors(location.id, [...selected])}
        >
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setSelected(new Set(location.monitorIds));
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        A location only receives, and may only report on, the monitors checked here.
      </p>
    </div>
  );
}

export function ProbeLocationsTable({
  locations,
  monitors,
}: {
  locations: ProbeLocationRow[];
  monitors: MonitorOption[];
}) {
  if (locations.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No probe locations yet. Create one to get a token for a checker.
      </p>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border border-b text-left text-muted-foreground text-xs">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Region</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Last seen</th>
              <th className="py-2 pr-4 font-medium">Monitors</th>
              <th className="py-2 font-medium sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id} className="border-border/60 border-b align-top">
                <td className="py-3 pr-4 font-medium">{l.name}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-1.5">
                    <span aria-hidden>
                      {getRegionInfo(l.region, { label: l.name, provider: l.provider }).flag}
                    </span>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{l.region}</code>
                  </div>
                  <div className="mt-0.5 text-muted-foreground text-xs">
                    {getRegionInfo(l.region, { label: l.name, provider: l.provider }).location}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                    <ProviderTag region={l.region} name={l.name} provider={l.provider} />
                    <span className="text-muted-foreground">{l.shared ? "shared" : "private"}</span>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <Badge variant={l.enabled ? "success" : "outline"}>
                    {l.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </td>
                <td className="py-3 pr-4">
                  <LastSeen at={l.lastSeenAt} />
                </td>
                <td className="py-3 pr-4">
                  <MonitorAssignment location={l} monitors={monitors} />
                </td>
                <td className="py-3">
                  {l.canManage ? (
                    <RowActions>
                      <RowActionAction action={() => setProbeLocationEnabled(l.id, !l.enabled)}>
                        {l.enabled ? "Disable" : "Enable"}
                      </RowActionAction>
                      <RowActionAction action={() => rotateProbeLocationToken(l.id)}>
                        Rotate token
                      </RowActionAction>
                      <RowActionAction destructive action={() => deleteProbeLocation(l.id)}>
                        Delete
                      </RowActionAction>
                    </RowActions>
                  ) : (
                    <span className="text-muted-foreground text-xs">operator</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}
