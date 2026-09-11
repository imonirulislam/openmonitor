"use client";

import { useEffect } from "react";

export default function StatusError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-16 text-center">
      <h1 className="font-semibold text-lg">Status is temporarily unavailable</h1>
      <p className="text-muted-foreground text-sm">
        This page couldn't load. That's a problem with the status page itself, not necessarily with
        the services it reports on.
      </p>
    </main>
  );
}
