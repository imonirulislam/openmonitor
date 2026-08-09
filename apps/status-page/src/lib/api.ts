import { ApiClient } from "@openmonitor/api-client";

let cached: ApiClient | undefined;

export function api(): ApiClient {
  if (!cached) {
    const baseUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
    if (!baseUrl) throw new Error("API_URL or NEXT_PUBLIC_API_URL must be set");
    cached = new ApiClient({ baseUrl });
  }
  return cached;
}
