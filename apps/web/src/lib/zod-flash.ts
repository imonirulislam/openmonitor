import { withToastRedirect } from "@openmonitor/ui";
import { redirect } from "next/navigation";
import type { z } from "zod";

/**
 * Run a Zod parser and, on failure, redirect with a flash toast carrying the
 * first validation error's message. Avoids surfacing raw JSON / stack traces
 * to users when a form submission is rejected by validation.
 *
 * Server actions should call this with the destination they want the user to
 * land back on (typically the same page they submitted from).
 */
export function parseOrFlash<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  destination: string,
): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    redirect(withToastRedirect(destination, first?.message ?? "Validation failed", "error"));
  }
  return result.data;
}
