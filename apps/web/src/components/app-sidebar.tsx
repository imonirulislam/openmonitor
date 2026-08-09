"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuButton,
  SidebarTrigger,
  ThemeToggle,
  useSidebar,
} from "@openmonitor/ui";
import {
  ActivityIcon,
  BellIcon,
  CogIcon,
  GaugeIcon,
  HeartPulseIcon,
  LogOutIcon,
  PanelTopIcon,
  ScanEyeIcon,
  WrenchIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type WorkspaceOption, WorkspaceSwitcher } from "~/components/workspace-switcher";
import { signOutAction } from "~/lib/actions/auth";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: GaugeIcon, exact: true },
  { href: "/dashboard/status-pages", label: "Status pages", icon: PanelTopIcon },
  { href: "/dashboard/monitors", label: "Monitors", icon: ActivityIcon },
  { href: "/dashboard/heartbeats", label: "Heartbeats", icon: HeartPulseIcon },
  { href: "/dashboard/maintenance", label: "Maintenance", icon: WrenchIcon },
  { href: "/dashboard/channels", label: "Channels", icon: BellIcon },
  { href: "/dashboard/audit-logs", label: "Audit logs", icon: ScanEyeIcon },
  { href: "/dashboard/settings", label: "Settings", icon: CogIcon },
];

export function AppSidebar({
  user,
  current,
  workspaces,
}: {
  user: { email?: string | null; role?: string | null } | null;
  current: WorkspaceOption | null;
  workspaces: WorkspaceOption[];
}) {
  const pathname = usePathname();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar>
      <SidebarHeader className="flex-row items-center gap-2 px-2">
        <WorkspaceSwitcher current={current} workspaces={workspaces} />
        {!collapsed ? <SidebarTrigger /> : null}
      </SidebarHeader>

      <SidebarContent>
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <SidebarMenuButton key={item.href} asChild isActive={isActive} tooltip={item.label}>
              <Link href={item.href}>
                <Icon />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        {!collapsed ? (
          <div className="flex items-start justify-between gap-2 px-1.5 text-xs">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{user?.email}</div>
              <div className="mt-0.5 font-mono text-[10px] uppercase text-muted-foreground tracking-wide">
                {user?.role}
              </div>
            </div>
            <ThemeToggle />
          </div>
        ) : (
          <div className="flex justify-center">
            <ThemeToggle />
          </div>
        )}
        <form action={signOutAction} className="mt-2">
          <SidebarMenuButton asChild tooltip="Sign out">
            <button type="submit">
              <LogOutIcon />
              <span>Sign out</span>
            </button>
          </SidebarMenuButton>
        </form>
        {collapsed ? (
          <div className="mt-1 flex justify-center">
            <SidebarTrigger />
          </div>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}
