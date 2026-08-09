import { Card } from "@openmonitor/ui";

export default function SubscribersTab() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-semibold text-lg">Subscribers</h2>
        <p className="mt-0.5 text-muted-foreground text-sm">
          Email subscribers receive notifications when incidents or maintenance fire on
          this page.
        </p>
      </div>
      <Card className="p-8 text-center">
        <h3 className="font-semibold text-base">Subscribers coming soon</h3>
        <p className="mt-1 text-muted-foreground text-sm">
          Adds an email subscribe form on the public page plus a Resend-backed delivery
          loop. Tracked as Part 2 of the status-page rebuild.
        </p>
      </Card>
    </div>
  );
}
