"use client";

import { useEffect, useState } from "react";

/**
 * The zone the page's dates are rendered in.
 *
 * Same reasoning as LocalTime in @openmonitor/ui: the tracker is corrected to
 * the visitor's zone on the client, so the server can't know the label. Render
 * UTC first and swap after hydration rather than render nothing.
 */
export function TimeZoneLabel() {
  const [zone, setZone] = useState("UTC");

  useEffect(() => {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved) setZone(resolved);
  }, []);

  return <span suppressHydrationWarning>{zone}</span>;
}
