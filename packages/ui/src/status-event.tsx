import { formatDistanceStrict } from "date-fns";
import { AlertCircleIcon, CheckIcon, WrenchIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Badge } from "./badge";
import { cn } from "./cn";
import { LocalTime } from "./local-time";
import { MarkdownView } from "./markdown";

const VARIANT_BORDER: Record<string, string> = {
  incident: "border-l-destructive",
  maintenance: "border-l-info",
  degraded: "border-l-warning",
};

const STATUS_LABEL: Record<string, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

export type EventUpdate = {
  status: "investigating" | "identified" | "monitoring" | "resolved";
  message: string;
  createdAt: string;
};

export type EventAffected = { slug: string; name: string };

/**
 * StatusEventBanner — used for ACTIVE events in the hero section. Larger,
 * left-border accent, includes the latest update timeline.
 */
export function StatusEventBanner({
  variant,
  title,
  startedAt,
  resolvedAt,
  status,
  severity,
  updates = [],
  affected = [],
  className,
  ...props
}: ComponentProps<"article"> & {
  variant: "incident" | "maintenance" | "degraded";
  title: string;
  startedAt: string;
  resolvedAt?: string | null;
  status?: string;
  severity?: string;
  updates?: EventUpdate[];
  affected?: EventAffected[];
}) {
  return (
    <article
      className={cn(
        "rounded-lg border border-border border-l-2 bg-card p-5 text-card-foreground",
        VARIANT_BORDER[variant],
        className,
      )}
      {...props}
    >
      <header className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-background [&>svg]:size-4",
            variant === "incident" && "bg-destructive",
            variant === "maintenance" && "bg-info",
            variant === "degraded" && "bg-warning",
          )}
        >
          {variant === "incident" ? <AlertCircleIcon /> : <WrenchIcon />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-sm">{title}</h3>
            {status ? <Badge variant="outline">{STATUS_LABEL[status] ?? status}</Badge> : null}
            {severity ? (
              <Badge
                variant={
                  severity === "critical"
                    ? "destructive"
                    : severity === "major"
                      ? "warning"
                      : "default"
                }
              >
                {severity}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-muted-foreground text-xs">
            <LocalTime date={startedAt} />
            {resolvedAt ? (
              <>
                {" — resolved "}
                <LocalTime date={resolvedAt} />
              </>
            ) : null}
          </p>
        </div>
      </header>

      {updates.length > 0 ? (
        <div className="mt-4 ml-10">
          <EventUpdateTimeline updates={updates} />
        </div>
      ) : null}

      {affected.length > 0 ? (
        <div className="mt-4 ml-10 flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Affected:</span>
          {affected.map((m) => (
            <Badge key={m.slug} variant="outline">
              {m.name}
            </Badge>
          ))}
        </div>
      ) : null}
    </article>
  );
}

/**
 * EventUpdateTimeline — vertical timeline of updates with dots and connecting
 * lines. Sorted with the latest first.
 */
export function EventUpdateTimeline({
  updates,
  maxUpdates,
}: {
  updates: EventUpdate[];
  maxUpdates?: number;
}) {
  const sorted = [...updates].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const displayed = maxUpdates ? sorted.slice(0, maxUpdates) : sorted;
  const earliest = sorted[sorted.length - 1];

  return (
    <ol className="flex flex-col">
      {displayed.map((update, i) => {
        const isLast = i === displayed.length - 1;
        const updateDate = new Date(update.createdAt);
        let durationText: string | undefined;
        if (i === 0 && update.status === "resolved" && earliest && earliest !== update) {
          const dur = formatDistanceStrict(new Date(earliest.createdAt), updateDate);
          if (dur !== "0 seconds") durationText = `(in ${dur})`;
        } else if (i > 0) {
          const prev = displayed[i - 1];
          if (prev) {
            const fromLast = formatDistanceStrict(updateDate, new Date(prev.createdAt));
            durationText = `(${fromLast} earlier)`;
          }
        }

        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center pt-1.5">
              <span
                className={cn(
                  "size-2 rounded-full ring-2 ring-background",
                  update.status === "resolved" ? "bg-success" : "bg-muted-foreground/40",
                )}
              />
              {!isLast ? <span className="my-1 w-px flex-1 bg-border" /> : null}
            </div>
            <div className={cn("min-w-0 flex-1 pb-3", isLast && "pb-0")}>
              <p className="text-xs">
                <span className="font-medium text-foreground">
                  {STATUS_LABEL[update.status] ?? update.status}
                </span>
                <span className="px-1.5 text-muted-foreground/60">·</span>
                <LocalTime
                  date={updateDate}
                  format="LLL dd, HH:mm"
                  className="font-mono text-muted-foreground"
                />
                {durationText ? (
                  <span className="ml-1.5 font-mono text-muted-foreground/70">
                    {durationText}
                  </span>
                ) : null}
              </p>
              {update.message ? (
                <div className="mt-0.5">
                  <MarkdownView>{update.message}</MarkdownView>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export type FeedEvent = {
  id: string;
  type: "incident" | "maintenance";
  title: string;
  date: string;
  status?: string;
  severity?: string;
  affected: EventAffected[];
  updates?: EventUpdate[];
  description?: string | null;
  endsAt?: string;
};

/**
 * StatusEventFeed — chronological list for the past-events section.
 * Each row has a date aside (lg+) and an inline timeline preview.
 */
export function StatusEventFeed({
  events,
  className,
  ...props
}: ComponentProps<"div"> & { events: FeedEvent[] }) {
  if (events.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-muted/30 px-6 py-10 text-center",
          className,
        )}
      >
        <p className="font-medium text-sm">No recent events</p>
        <p className="font-mono text-muted-foreground text-xs">
          Nothing reported in the last 30 days.
        </p>
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {events.map((e) => (
        <FeedRow key={`${e.type}-${e.id}`} event={e} />
      ))}
    </div>
  );
}

function FeedRow({ event }: { event: FeedEvent }) {
  const date = new Date(event.date);
  const distance = formatDistanceStrict(date, new Date(), { addSuffix: true });

  return (
    <article className="grid gap-4 lg:grid-cols-[140px_1fr]">
      <aside className="flex items-baseline gap-2 lg:flex-col lg:items-start lg:gap-1">
        <LocalTime date={date} format="LLL d" className="font-medium text-foreground text-sm" />
        <Badge variant="default" className="font-mono text-[10px]">
          {distance}
        </Badge>
      </aside>
      <div className="-my-2 -mx-3 flex flex-col gap-2 rounded-lg border border-transparent px-3 py-2 transition-colors hover:border-border/50 hover:bg-muted/40">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full text-background [&>svg]:size-3",
              event.type === "incident" ? "bg-success" : "bg-info",
            )}
          >
            {event.type === "incident" ? <CheckIcon /> : <WrenchIcon />}
          </div>
          <h3 className="font-medium text-sm">{event.title}</h3>
        </div>
        {event.type === "incident" && event.updates && event.updates.length > 0 ? (
          <div className="ml-7">
            <EventUpdateTimeline updates={event.updates} maxUpdates={3} />
          </div>
        ) : null}
        {event.type === "maintenance" && event.description ? (
          <p className="ml-7 text-foreground text-sm">{event.description}</p>
        ) : null}
        {event.endsAt && event.type === "maintenance" ? (
          <p className="ml-7 font-mono text-muted-foreground text-xs">
            <LocalTime date={date} format="LLL dd HH:mm" />
            {" → "}
            <LocalTime date={event.endsAt} format="LLL dd HH:mm" />
          </p>
        ) : null}
        {event.affected.length > 0 ? (
          <div className="ml-7 flex flex-wrap gap-1">
            {event.affected.map((m) => (
              <Badge key={m.slug} variant="default" className="text-[10px]">
                {m.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function Separator({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="separator"
      className={cn("h-px w-full shrink-0 bg-border", className)}
      {...props}
    />
  );
}

export function SectionMetaTitle({
  children,
  meta,
  className,
}: {
  children: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between", className)}>
      <h2 className="font-medium text-sm tracking-tight">{children}</h2>
      {meta ? <div className="text-muted-foreground text-xs">{meta}</div> : null}
    </div>
  );
}

/**
 * @deprecated Use StatusEventBanner instead. Kept for back-compat with
 * existing imports during the redesign.
 */
export const StatusEvent = StatusEventBanner;
