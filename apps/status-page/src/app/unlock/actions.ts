"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api } from "~/lib/api";
import { unlockCookieName } from "~/lib/unlock-cookie";

const ONE_DAY_SECONDS = 24 * 60 * 60;

/**
 * Submit a status-page password. On success, set the unlock cookie and bounce
 * back to the page. On failure, redirect back to /unlock with an error.
 */
export async function submitUnlock(formData: FormData) {
  const workspace = (formData.get("workspace") as string | null) || undefined;
  const page = (formData.get("page") as string | null) || undefined;
  const host = (formData.get("host") as string | null) || undefined;
  const password = String(formData.get("password") ?? "");

  const result = await api().unlockPage({ workspace, page, host, password });

  const params = new URLSearchParams();
  if (workspace) params.set("workspace", workspace);
  if (page) params.set("page", page);

  if (!result) {
    params.set("error", "Wrong password");
    redirect(`/unlock?${params.toString()}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(unlockCookieName({ workspace, page, host }), result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_DAY_SECONDS,
  });

  // Bounce to the targeted page. With workspace+page set, route to the
  // workspace path; otherwise, back to /.
  if (workspace && page) redirect(`/${workspace}/${page}`);
  redirect("/");
}
