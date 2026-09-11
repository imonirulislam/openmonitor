import { SidebarInset, SidebarProvider } from "@openmonitor/ui";
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
        <div className="mx-auto w-full max-w-5xl px-6 py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
