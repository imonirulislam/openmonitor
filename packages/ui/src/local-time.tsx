"use client";

import { format as formatDate } from "date-fns";
import { useEffect, useState } from "react";
import { cn } from "./cn";

/**
 * LocalTime — renders a timestamp in the user's browser timezone after
 * hydration, with the ISO string as a stable SSR fallback.
 *
 * Why this shape:
 * - The DB stores UTC. The API returns ISO 8601 with `Z`.
 * - date-fns `format` uses local TZ — that's *Node's* TZ during SSR and the
 *   *browser's* TZ on hydration. On any deployment where those differ, you
 *   get both a hydration mismatch and a wrong-TZ display.
 * - Solution: SSR and the first client paint render a stable, deterministic
 *   text (the ISO string). Once mounted, useEffect swaps in the formatted
 *   local-time string. The `<time dateTime>` element keeps the underlying UTC
 *   instant readable to assistive tech and indexers regardless of what's
 *   displayed.
 *
 * Defaults to `LLL dd, y · HH:mm` to match the rest of the UI. Pass any
 * date-fns format string via the `format` prop.
 */
export function LocalTime({
  date,
  format = "LLL dd, y · HH:mm",
  className,
  showTimezone = false,
}: {
  date: string | Date;
  format?: string;
  className?: string;
  /** Append the resolved IANA TZ short name in parentheses, e.g. "(CET)". */
  showTimezone?: boolean;
}) {
  const iso = typeof date === "string" ? date : date.toISOString();
  // Initial render: ISO string. Stable across server + first client paint.
  const [text, setText] = useState(iso);

  useEffect(() => {
    const d = new Date(iso);
    let formatted = formatDate(d, format);
    if (showTimezone) {
      const tz = Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
        .formatToParts(d)
        .find((p) => p.type === "timeZoneName")?.value;
      if (tz) formatted += ` (${tz})`;
    }
    setText(formatted);
  }, [iso, format, showTimezone]);

  return (
    <time dateTime={iso} className={cn("tabular-nums", className)} suppressHydrationWarning>
      {text}
    </time>
  );
}

/**
 * Same idea as LocalTime but styled inline (no <time> element wrapper).
 * Useful when you need to compose with other elements without nesting.
 */
export function LocalTimeText({
  date,
  format = "LLL dd, y · HH:mm",
}: {
  date: string | Date;
  format?: string;
}) {
  const iso = typeof date === "string" ? date : date.toISOString();
  const [text, setText] = useState(iso);
  useEffect(() => {
    setText(formatDate(new Date(iso), format));
  }, [iso, format]);
  return <span suppressHydrationWarning>{text}</span>;
}
