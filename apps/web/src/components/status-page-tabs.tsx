"use client";

import { cn } from "@openmonitor/ui";
import { CogIcon, HammerIcon, LayoutTemplateIcon, MegaphoneIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { value: "status-reports", label: "Status Reports", icon: MegaphoneIcon },
  { value: "maintenances", label: "Maintenances", icon: HammerIcon },
  { value: "subscribers", label: "Subscribers", icon: UsersIcon },
  { value: "components", label: "Components", icon: LayoutTemplateIcon },
  { value: "edit", label: "Settings", icon: CogIcon },
] as const;

/**
 * Sub-area tab nav for /status-pages/[id]/<tab>. Mirrors openstatus's
 * status-page detail layout: status reports, maintenances, subscribers,
 * components, settings.
 */
export function StatusPageTabs({ pageId }: { pageId: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-0.5 border-b border-border">
      {TABS.map((t) => {
        const href = `/status-pages/${pageId}/${t.value}`;
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        const Icon = t.icon;
        return (
          <Link
            key={t.value}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors -mb-px",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
