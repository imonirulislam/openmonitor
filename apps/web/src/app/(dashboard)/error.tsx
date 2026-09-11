"use client";

import { Button, Card } from "@openmonitor/ui";
import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="flex flex-col items-start gap-3 p-8">
      <h2 className="font-semibold text-lg">This page didn't load</h2>
      <p className="text-muted-foreground text-sm">
        Usually the datastore is unreachable rather than anything being wrong with your monitors —
        probing and alerting carry on regardless.
      </p>
      {error.digest ? (
        <p className="font-mono text-muted-foreground text-xs">Reference: {error.digest}</p>
      ) : null}
      <Button onClick={reset}>Try again</Button>
    </Card>
  );
}
