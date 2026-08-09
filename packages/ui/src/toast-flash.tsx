"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

const SEARCH_PARAM_MESSAGE = "toast";
const SEARCH_PARAM_TYPE = "toastType"; // "success" | "error" | "info"

/**
 * ToastFlash — drop once into a layout. Reads `?toast=<msg>` and
 * `?toastType=<success|error|info>` from the URL on mount, fires a toast,
 * then strips them from the URL via router.replace so refreshes don't repeat
 * the toast.
 *
 * The corresponding server-safe URL builder lives in `./toast-redirect`.
 */
export function ToastFlash() {
  const router = useRouter();
  const params = useSearchParams();
  const message = params.get(SEARCH_PARAM_MESSAGE);
  const type = params.get(SEARCH_PARAM_TYPE) ?? "success";

  useEffect(() => {
    if (!message) return;
    if (type === "error") toast.error(message);
    else if (type === "info") toast(message);
    else toast.success(message);

    const next = new URLSearchParams(params.toString());
    next.delete(SEARCH_PARAM_MESSAGE);
    next.delete(SEARCH_PARAM_TYPE);
    const qs = next.toString();
    const path = window.location.pathname;
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    // biome-ignore lint/correctness/useExhaustiveDependencies: fire once per message change
  }, [message]);

  return null;
}
