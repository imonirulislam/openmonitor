import { Card, SectionDescription, SectionHeader, SectionTitle } from "@openmonitor/ui";

export default function SubscribersTab() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader>
        <SectionTitle>Subscribers</SectionTitle>
        <SectionDescription>
          Email subscribers receive notifications when incidents or maintenance fire on this page.
        </SectionDescription>
      </SectionHeader>
      <Card className="p-8 text-center">
        <h3 className="font-semibold text-base">Subscribers coming soon</h3>
        <p className="mt-1 text-muted-foreground text-sm">
          Adds an email subscribe form on the public page plus a Resend-backed delivery loop.
          Tracked as Part 2 of the status-page rebuild.
        </p>
      </Card>
    </div>
  );
}
