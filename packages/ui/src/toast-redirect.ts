/**
 * Server-safe helper for the toast-flash pattern. Lives in a non-"use client"
 * file so server actions can import and call it; the client-side ToastFlash
 * component reads the URL params it produces.
 *
 * Use:
 *   redirect(withToastRedirect("/dashboard/monitors", "Saved", "success"));
 */
export function withToastRedirect(
  destination: string,
  message: string,
  type: "success" | "error" | "info" = "success",
): string {
  const url = new URL(destination, "http://placeholder");
  url.searchParams.set("toast", message);
  url.searchParams.set("toastType", type);
  return `${url.pathname}${url.search}`;
}
