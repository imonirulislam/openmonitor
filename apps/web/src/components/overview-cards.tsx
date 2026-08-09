import { formatDistanceToNowStrict } from "date-fns";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card } from "@openmonitor/ui";

/**
 * Single stat card for the overview's top row. Two modes:
 *   - `value`: a literal string (used for counts).
 *   - `relativeTo`: a Date or null; renders "3h ago" or "None".
 *
 * Pass exactly one. The whole card is a link to the relevant list page.
 * Modeled on openstatus's overview cards: small label, big value, icon in
 * the top-right corner.
 */
export function OverviewStatCard({
  label,
  value,
  relativeTo,
  icon: Icon,
  href,
}: {
  label: string;
  value?: string;
  relativeTo?: Date | null;
  icon: LucideIcon;
  href: string;
}) {
  const display =
    value !== undefined
      ? value
      : relativeTo
        ? formatDistanceToNowStrict(relativeTo, { addSuffix: true })
        : "None";

  return (
    <Link href={href} className="block">
      <Card className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/30">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-muted-foreground text-xs">{label}</span>
          <Icon className="size-3.5 text-muted-foreground" />
        </div>
        <span className="font-semibold text-lg tabular-nums">{display}</span>
      </Card>
    </Link>
  );
}
