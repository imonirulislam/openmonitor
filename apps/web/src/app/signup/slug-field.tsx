"use client";

import { Input, Label } from "@openmonitor/ui";
import { useState } from "react";

/** Address field with a live preview of the resulting URL. */
export function SlugField({ statusPageUrl }: { statusPageUrl: string }) {
  const [slug, setSlug] = useState("");
  const base = statusPageUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="slug">Status page address</Label>
      <Input
        id="slug"
        name="slug"
        value={slug}
        // Normalise as they type so the field can't hold something the action
        // will reject.
        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
        required
        minLength={2}
        maxLength={80}
        autoComplete="off"
        spellCheck={false}
        placeholder="acme"
      />
      <p className="text-muted-foreground text-xs">
        Your page will be at{" "}
        <span className="font-mono">
          {slug || "your-address"}.{base}
        </span>
      </p>
    </div>
  );
}
