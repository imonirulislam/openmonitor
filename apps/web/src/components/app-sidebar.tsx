"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupDivider,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "@openmonitor/ui";
import {
  ActivityIcon,
  BellIcon,
  CogIcon,
  GaugeIcon,
  HeartPulseIcon,
  PanelTopIcon,
  ScanEyeIcon,
  WrenchIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type SessionUser, UserMenu } from "~/components/user-menu";
import { type WorkspaceOption, WorkspaceSwitcher } from "~/components/workspace-switcher";

const NAV = [
  {
    label: "Monitoring",
    items: [
      { href: "/", label: "Overview", icon: GaugeIcon, exact: true },
      { href: "/monitors", label: "Monitors", icon: ActivityIcon },
      { href: "/heartbeats", label: "Heartbeats", icon: HeartPulseIcon },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/status-pages", label: "Status pages", icon: PanelTopIcon },
      { href: "/maintenance", label: "Maintenance", icon: WrenchIcon },
      { href: "/channels", label: "Channels", icon: BellIcon },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/audit-logs", label: "Audit logs", icon: ScanEyeIcon },
      { href: "/settings", label: "Settings", icon: CogIcon },
    ],
  },
];

export function AppSidebar({
  user,
  current,
  workspaces,
}: {
  user: SessionUser | null;
  current: WorkspaceOption | null;
  workspaces: WorkspaceOption[];
}) {
  const pathname = usePathname();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar>
      <SidebarHeader>
        <WorkspaceSwitcher current={current} workspaces={workspaces} />
        {!collapsed ? <SidebarTrigger className="shrink-0" /> : null}
      </SidebarHeader>

      <SidebarContent>
        {NAV.map((group, i) => (
          <SidebarGroup key={group.label}>
            {i === 0 ? null : <SidebarGroupDivider />}
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            {group.items.map((item) => {
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
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="flex flex-col gap-1">
        {user ? <UserMenu user={user} /> : null}
        {collapsed ? <SidebarTrigger className="mx-auto" /> : null}
      </SidebarFooter>
    </Sidebar>
  );
}
