"use client";

import { format as formatDate } from "date-fns";
import { useEffect, useState } from "react";
import { cn } from "./cn";

/**
 * Format an instant as UTC wall-clock, identically on server and client.
 *
 * date-fns `format` always renders in the *runtime's* local zone, and there is
 * no shared zone between a server container and a visitor's browser. Shifting
 * the instant by the runtime's own offset first cancels that out: both sides
 * then format the same wall-clock numbers, so SSR and the first client paint
 * produce byte-identical text and React has nothing to reconcile.
 */
function formatUtc(d: Date, format: string): string {
  return formatDate(new Date(d.getTime() + d.getTimezoneOffset() * 60_000), format);
}

/**
 * LocalTime — renders a timestamp in the user's browser timezone after
 * hydration, with a UTC rendering as the SSR fallback.
 *
 * Why this shape:
 * - The DB stores UTC. The API returns ISO 8601 with `Z`.
 * - The server cannot know the visitor's timezone, so the final string is only
 *   knowable on the client. Something has to render first.
 * - That first render is the *same format* in UTC rather than a raw ISO string.
 *   Both are eventually replaced, but "Aug 14, 2026 19:36 (UTC)" swapping to
 *   "Aug 14, 2026 21:36 (GMT+2)" changes a few digits, where
 *   "2026-08-14T19:36:58.000Z" swapping to the same target visibly reflows and
 *   reads as a flicker on every timestamp on the page.
 * - `<time dateTime>` keeps the exact UTC instant available to assistive tech
 *   and indexers regardless of what's displayed.
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
  /** Append the resolved timezone in parentheses, e.g. "(CET)" — "(UTC)" until hydrated. */
  showTimezone?: boolean;
}) {
  const iso = typeof date === "string" ? date : date.toISOString();
  const [text, setText] = useState(() => {
    const base = formatUtc(new Date(iso), format);
    return showTimezone ? `${base} (UTC)` : base;
  });

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
  const [text, setText] = useState(() => formatUtc(new Date(iso), format));
  useEffect(() => {
    setText(formatDate(new Date(iso), format));
  }, [iso, format]);
  return <span suppressHydrationWarning>{text}</span>;
}
