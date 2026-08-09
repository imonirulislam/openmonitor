"use client";

import { cn } from "@openmonitor/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

// "Settings" sits last after Logs so the configuration entry-point is
// out of the way during day-to-day operations (operators usually want
// Overview / Incidents / Logs in flow).
const TABS = [
  { slug: "", label: "Overview" },
  { slug: "incidents", label: "Incidents" },
  { slug: "logs", label: "Logs" },
  { slug: "edit", label: "Settings" },
];

export function MonitorTabs({ monitorId }: { monitorId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/monitors/${monitorId}`;

  return (
    <nav className="inline-flex h-9 items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
      {TABS.map((t) => {
        const href = t.slug ? `${base}/${t.slug}` : base;
        const isActive = t.slug
          ? pathname === href || pathname.startsWith(`${href}/`)
          : pathname === base;
        return (
          <Link
            key={t.slug || "overview"}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center justify-center rounded-sm px-3 py-1 text-sm transition-colors",
              isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
