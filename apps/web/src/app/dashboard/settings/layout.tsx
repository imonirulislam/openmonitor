import { Separator } from "@openmonitor/ui";
import type { ReactNode } from "react";
import { SettingsTabs } from "~/components/settings-tabs";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-semibold text-xl tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Workspace, members, and account preferences.
        </p>
      </header>
      <SettingsTabs />
      <Separator />
      {children}
    </div>
  );
}
