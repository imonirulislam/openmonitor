"use server";

import { withToastRedirect } from "@openmonitor/ui";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "~/auth";

const API_URL = process.env.API_URL ?? "http://localhost:5002";
const PROBE_API_KEY = process.env.PROBE_API_KEY ?? "";

/**
 * Trigger a manual retention sweep. Admin-only — the API endpoint itself
 * is gated by `PROBE_API_KEY`, but we still gate at the form action layer
 * so a non-admin who somehow lands on the System page can't fire the
 * sweep through DevTools.
 */
export async function runRetentionAction() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") {
    redirect(withToastRedirect("/settings/system", "Admin role required", "error"));
  }
  const res = await fetch(`${API_URL}/v1/system/scheduler/run`, {
    method: "POST",
    headers: { authorization: `Bearer ${PROBE_API_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) {
    redirect(withToastRedirect("/settings/system", `Sweep failed: ${res.status}`, "error"));
  }
  const body = (await res.json()) as {
    monitorRunsDeleted: number;
    eventsDeleted: number;
    error?: string;
  };
  revalidatePath("/settings/system");
  if (body.error) {
    redirect(withToastRedirect("/settings/system", `Sweep error: ${body.error}`, "error"));
  }
  redirect(
    withToastRedirect(
      "/settings/system",
      `Sweep finished: deleted ${body.monitorRunsDeleted} runs, ${body.eventsDeleted} events.`,
    ),
  );
}
