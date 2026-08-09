"use client";

import { cn, ThemeToggle } from "@openmonitor/ui";
import { ActivityIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Top-level static routes that aren't slug-prefixed. When the first path
// segment matches one of these, we treat the page as root-scoped.
const RESERVED_ROOTS = new Set(["events", "monitors", "unlock"]);
// Sub-routes within a scoped page. When the second path segment matches one
// of these, the URL is `/<page>/<sub>`; otherwise it's `/<workspace>/<page>`.
const SCOPED_TAB_SEGMENTS = new Set(["events", "monitors"]);

/**
 * Derives the URL prefix for the current page so the nav tabs scope to the
 * right page. Returns "" for root routes (`/`, `/events`, `/monitors`,
 * `/monitors/<slug>`) and `/<page-slug>` (or `/<workspace>/<page>`) for
 * slug-scoped routes.
 */
function pagePrefixFromPathname(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "";
  if (RESERVED_ROOTS.has(segments[0]!)) return "";
  if (segments.length === 1) return `/${segments[0]}`;
  if (SCOPED_TAB_SEGMENTS.has(segments[1]!)) return `/${segments[0]}`;
  return `/${segments[0]}/${segments[1]}`;
}

export function SiteHeader({ title }: { title: string }) {
  const pathname = usePathname();
  const prefix = pagePrefixFromPathname(pathname);
  const statusHref = prefix || "/";
  const nav = [
    { label: "Status", href: statusHref },
    { label: "Events", href: `${prefix}/events` },
    { label: "Monitors", href: `${prefix}/monitors` },
  ];

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4">
        <Link href={statusHref} className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
            <ActivityIcon className="size-4" />
          </div>
          <span className="hidden font-semibold text-sm sm:inline">{title}</span>
        </Link>

        <nav className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
          {nav.map((item) => {
            const isActive =
              item.label === "Status"
                ? pathname === statusHref
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "rounded-sm px-3 py-1 text-sm transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}

export function SiteFooter({ title }: { title: string }) {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex h-12 w-full max-w-3xl items-center justify-between px-4 text-muted-foreground text-xs">
        <span className="font-mono">{title}</span>
        <span>Powered by OpenMonitor</span>
      </div>
    </footer>
  );
}
