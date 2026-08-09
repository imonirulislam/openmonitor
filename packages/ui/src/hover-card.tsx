"use client";

/**
 * Thin re-export of Radix's hover-card so consumers can pull it from
 * `@openmonitor/ui` instead of adding `@radix-ui/react-hover-card` as a
 * direct dependency. We don't wrap the API — Radix's surface is small
 * and the existing consumers (status-tracker, probe timing bar) want the
 * portal/trigger primitives directly.
 */
export {
  Arrow as HoverCardArrow,
  Content as HoverCardContent,
  Portal as HoverCardPortal,
  Root as HoverCard,
  Trigger as HoverCardTrigger,
} from "@radix-ui/react-hover-card";
