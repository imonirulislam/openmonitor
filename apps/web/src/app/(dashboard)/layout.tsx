import { SidebarInset, SidebarMobileHeader, SidebarProvider } from "@openmonitor/ui";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppSidebar } from "~/components/app-sidebar";
import { getCurrentUser, getCurrentWorkspace, getUserWorkspaces } from "~/lib/workspace";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const stored = cookieStore.get("sidebar_state")?.value;
  const defaultOpen = stored !== "false";

  const [ws, workspaces, user] = await Promise.all([
    getCurrentWorkspace(),
    getUserWorkspaces(),
    getCurrentUser(),
  ]);
  const current = workspaces.find((w) => w.id === ws.workspaceId) ?? null;

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        user={{ email: user.email, name: user.name, image: user.image, role: ws.role }}
        current={current}
        workspaces={workspaces}
      />
      <SidebarInset>
        <SidebarMobileHeader>
          <span className="truncate font-medium text-sm">{current?.name ?? "OpenMonitor"}</span>
        </SidebarMobileHeader>
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
