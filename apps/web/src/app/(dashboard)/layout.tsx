import { SidebarInset, SidebarProvider } from "@openmonitor/ui";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { auth } from "~/auth";
import { AppSidebar } from "~/components/app-sidebar";
import { getCurrentWorkspace, getUserWorkspaces } from "~/lib/workspace";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const cookieStore = await cookies();
  const stored = cookieStore.get("sidebar_state")?.value;
  const defaultOpen = stored !== "false";

  const ws = await getCurrentWorkspace();
  const workspaces = await getUserWorkspaces();
  const current = workspaces.find((w) => w.id === ws.workspaceId) ?? null;

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        user={session?.user ? { email: session.user.email, role: ws.role } : null}
        current={current}
        workspaces={workspaces}
      />
      <SidebarInset>
        <div className="mx-auto w-full max-w-7xl px-6 py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
