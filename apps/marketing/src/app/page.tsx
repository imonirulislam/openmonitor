import {
  ActivityIcon,
  BellIcon,
  GaugeIcon,
  GlobeIcon,
  HeartPulseIcon,
  MegaphoneIcon,
  ServerIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { APP_URL, REPO_URL, SIGNUP_URL, SIGNUPS_OPEN } from "~/components/site-chrome";

/**
 * Every claim on this page is something the product does today. Monitor kinds
 * come from `monitorKindEnum`, the region policies from
 * `monitorRegionPolicyEnum`, the storage figure was measured on real rows, and
 * Slack is the only channel because `channelTypeEnum` has one value. When a
 * feature lands, update this; don't let it drift ahead of the code.
 */

const FEATURES: Array<{ icon: ReactNode; title: string; body: string }> = [
  {
    icon: <GaugeIcon className="size-4" />,
    title: "HTTP, TCP and DNS checks",
    body: "HTTP probes record a full timing breakdown — DNS, connect, TLS handshake, time to first byte, transfer — so a slow endpoint tells you which phase got slow.",
  },
  {
    icon: <GlobeIcon className="size-4" />,
    title: "Probe from several regions",
    body: "Run a checker wherever you like; each reports under its own region. Decide per monitor whether down means any region, a majority, or all of them.",
  },
  {
    icon: <MegaphoneIcon className="size-4" />,
    title: "Status pages",
    body: "A 90-day uptime tracker, incident history and scheduled maintenance. Custom domain, your own CSS, optional password, RSS feed and SVG badges.",
  },
  {
    icon: <BellIcon className="size-4" />,
    title: "Slack alerts that survive Slack",
    body: "Notifications are written to an outbox in the same transaction as the state change, then delivered with retry and backoff. Slack being down delays alerts; it never loses them.",
  },
  {
    icon: <HeartPulseIcon className="size-4" />,
    title: "Heartbeats for jobs",
    body: "Give a cron job a URL to ping. Miss the window by more than its grace period and it opens an incident like any other monitor.",
  },
  {
    icon: <ShieldCheckIcon className="size-4" />,
    title: "Workspaces and audit logs",
    body: "Admin, editor and viewer roles per workspace. Every admin action is recorded, immutably, with who did it and to what.",
  },
];

function Feature({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-4">
      <div className="flex size-7 items-center justify-center rounded-md bg-muted text-foreground">
        {icon}
      </div>
      <h3 className="font-medium text-sm">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto w-full max-w-5xl px-4 pt-16 pb-12 sm:pt-24">
        <p className="mb-4 inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1 text-muted-foreground text-xs">
          <ActivityIcon className="size-3.5" />
          Open source, AGPL-3.0
        </p>
        <h1 className="max-w-3xl text-balance font-semibold text-3xl leading-tight tracking-tight sm:text-5xl">
          Uptime monitoring and status pages you actually own.
        </h1>
        <p className="mt-5 max-w-2xl text-balance text-base text-muted-foreground leading-relaxed sm:text-lg">
          Watch HTTP, TCP and DNS endpoints from as many regions as you care to run. Publish a
          status page your customers can read during an outage. Get told in Slack. Host the whole
          thing yourself, on hardware you control, for about the price of nothing.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href={SIGNUPS_OPEN ? SIGNUP_URL : APP_URL}
            className="rounded-md bg-foreground px-4 py-2 font-medium text-background text-sm"
          >
            {SIGNUPS_OPEN ? "Create your status page" : "Open the dashboard"}
          </a>
          <a
            href={REPO_URL}
            className="rounded-md border border-border px-4 py-2 font-medium text-sm hover:bg-muted"
          >
            Read the source
          </a>
        </div>
        <p className="mt-4 text-muted-foreground text-xs">
          No account required to self-host. <code className="font-mono">docker compose up</code> and
          you have the whole stack.
        </p>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-12">
        <h2 className="font-medium text-base">What it does</h2>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          Scoped deliberately. Everything here works; nothing here is a roadmap item.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Feature key={f.title} {...f} />
          ))}
        </div>
      </section>

      {/* How it fits together */}
      <section className="mx-auto w-full max-w-5xl px-4 py-12">
        <h2 className="font-medium text-base">How it fits together</h2>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          Five services do the monitoring. Run them on one box or spread them across providers —
          only the checker has to be a container.
        </p>
        <div className="mt-6 overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {[
                ["checker", "Go binary. Runs the probes and posts results back. One per region."],
                ["api", "Public read API, probe ingestion, Slack receiver."],
                ["web", "The dashboard. Every admin write happens here."],
                ["status-page", "The public page. Reads the API and nothing else."],
                ["notifier", "Drains the outbox and delivers Slack messages."],
              ].map(([name, what]) => (
                <tr key={name}>
                  <td className="w-36 px-4 py-3 align-top font-mono text-xs">{name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Self-host */}
      <section id="self-host" className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-12">
        <div className="rounded-md border border-border p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <ServerIcon className="size-4" />
            <h2 className="font-medium text-base">Run it yourself</h2>
          </div>
          <p className="mt-3 max-w-2xl text-muted-foreground text-sm leading-relaxed">
            Probe results go to ClickHouse, where a row costs about two bytes against roughly three
            hundred in Postgres. That is the difference between months of multi-region history
            fitting in a free-tier database and not — which is why a real deployment can sit on free
            tiers rather than a bill.
          </p>
          <pre className="mt-5 overflow-x-auto rounded-md bg-muted p-4 font-mono text-xs leading-relaxed">
            <code>{`git clone ${REPO_URL.replace("https://", "")}
cd openmonitor
docker compose up --build`}</code>
          </pre>
          <p className="mt-4 text-muted-foreground text-sm">
            Migrations run on start. The one thing that can&rsquo;t be serverless is the checker —
            TCP and DNS probes need real sockets and a chosen egress region — so it stays a
            container.{" "}
            <a
              href={`${REPO_URL}/blob/main/DEPLOYMENT.md`}
              className="underline underline-offset-4"
            >
              The deployment guide
            </a>{" "}
            has the rest.
          </p>
        </div>
      </section>

      {/* Close */}
      <section className="mx-auto w-full max-w-5xl px-4 pt-4 pb-20">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-medium text-base">Start watching something</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Add a monitor, point a checker at it, and put the status page on your domain.
            </p>
          </div>
          <a
            href={SIGNUPS_OPEN ? SIGNUP_URL : APP_URL}
            className="rounded-md bg-foreground px-4 py-2 font-medium text-background text-sm"
          >
            {SIGNUPS_OPEN ? "Create your status page" : "Open the dashboard"}
          </a>
        </div>
      </section>
    </>
  );
}
