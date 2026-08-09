"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { type FeedEvent, StatusEventFeed, cn } from "@openmonitor/ui";

type Tab = "reports" | "maintenances";

export function EventsTabs({
  reports,
  maintenances,
}: {
  reports: FeedEvent[];
  maintenances: FeedEvent[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = (searchParams.get("tab") as Tab) ?? "reports";

  const setTab = (t: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (t === "reports") params.delete("tab");
    else params.set("tab", t);
    const qs = params.toString();
    router.replace(qs ? `/events?${qs}` : "/events");
  };

  return (
    <>
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
          <TabButton active={active === "reports"} onClick={() => setTab("reports")}>
            Reports
          </TabButton>
          <TabButton active={active === "maintenances"} onClick={() => setTab("maintenances")}>
            Maintenances
          </TabButton>
        </div>
      </div>
      <div className="mt-8">
        <StatusEventFeed events={active === "reports" ? reports : maintenances} />
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-sm px-4 py-1 text-sm transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
