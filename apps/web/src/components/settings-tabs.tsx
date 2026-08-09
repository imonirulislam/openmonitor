"use client";

import { cn } from "@openmonitor/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard/settings/workspace", label: "Workspace" },
  { href: "/dashboard/settings/members", label: "Members" },
  { href: "/dashboard/settings/templates", label: "Templates" },
  { href: "/dashboard/settings/system", label: "System" },
  { href: "/dashboard/settings/account", label: "Account" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="inline-flex h-9 w-fit items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
      {TABS.map((t) => {
        const isActive = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
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
