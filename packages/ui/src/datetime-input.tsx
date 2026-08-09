"use client";

import { useState } from "react";
import { Input } from "./input";

/**
 * DateTimeLocalInput — a `datetime-local` input that submits an ISO-8601
 * timestamp in the browser's local timezone (e.g. `2026-05-04T03:00:00+02:00`).
 *
 * The native `datetime-local` element stores the string the user typed without
 * any timezone info. Submitting that string straight to the server makes Node
 * interpret it in the *server's* local TZ, which is almost never what the user
 * intended. This component adds a hidden field with the proper ISO conversion
 * so the server stores an unambiguous UTC instant.
 *
 * Usage:
 *   <DateTimeLocalInput name="startsAt" defaultValue={iso} required />
 *
 * The form receives `formData.get("startsAt")` as an ISO string.
 */
export function DateTimeLocalInput({
  name,
  defaultValue,
  required,
  id,
  className,
}: {
  name: string;
  defaultValue?: string; // ISO 8601 (UTC or with offset)
  required?: boolean;
  id?: string;
  className?: string;
}) {
  // datetime-local needs `YYYY-MM-DDTHH:mm` in *local* time. Convert the
  // initial ISO (which may be UTC) into the local form for the visible input.
  const initialLocal = defaultValue ? toLocalInputValue(new Date(defaultValue)) : "";
  const [local, setLocal] = useState(initialLocal);

  // Hidden value: full ISO with local TZ offset. Updated on every change.
  const hiddenIso = local ? toIsoFromLocal(local) : "";

  return (
    <>
      <Input
        id={id}
        type="datetime-local"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        required={required}
        className={className}
      />
      <input type="hidden" name={name} value={hiddenIso} />
    </>
  );
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function toLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromLocal(local: string): string {
  // `local` is "YYYY-MM-DDTHH:mm". Constructing `new Date(local)` interprets
  // it in the browser's TZ, which is exactly what we want — the user typed
  // a wall-clock time. Then `.toISOString()` converts to UTC for transport.
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}
