import { ThemeToggle } from "@openmonitor/ui";
import { ActivityIcon } from "lucide-react";
import Link from "next/link";

/**
 * Where the dashboard and status page live.
 *
 * Read from the environment because the marketing site is the only app that
 * links *out* to the others, and those hostnames differ per deployment — a
 * self-hoster on one box has ports, a hosted install has subdomains. Defaults
 * are the local compose ports so `bun run dev` links work with no setup.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";
const STATUS_URL = process.env.NEXT_PUBLIC_STATUS_PAGE_URL ?? "http://localhost:5003";
const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/imonirulislam/openmonitor";

// Marketing can't read the dashboard's SIGNUPS_ENABLED, so it gets its own
// public flag. Off by default: a self-hoster's landing page shouldn't offer a
// signup that /signup would 404.
export const SIGNUPS_OPEN = ["on", "true", "1", "yes"].includes(
  (process.env.NEXT_PUBLIC_SIGNUPS_ENABLED ?? "").trim().toLowerCase(),
);
export const SIGNUP_URL = `${APP_URL}/signup`;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-border border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
            <ActivityIcon className="size-4" />
          </div>
          <span className="font-semibold text-base tracking-tight">OpenMonitor</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/#features"
            className="hidden rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground sm:block"
          >
            Features
          </Link>
          <Link
            href="/#self-host"
            className="hidden rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground sm:block"
          >
            Self-host
          </Link>
          <a
            href={REPO_URL}
            className="hidden rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground sm:block"
          >
            GitHub
          </a>
          <ThemeToggle />
          <a href={APP_URL} className="ml-1 font-medium text-sm">
            Sign in
          </a>
          {SIGNUPS_OPEN ? (
            <a
              href={SIGNUP_URL}
              className="rounded-md bg-foreground px-3 py-1.5 font-medium text-background text-sm"
            >
              Get started
            </a>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-border border-t">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          Open source under{" "}
          <a href={`${REPO_URL}/blob/main/LICENSE`} className="underline underline-offset-4">
            AGPL-3.0
          </a>
          . Run it yourself, or don&rsquo;t.
        </p>
        <nav className="flex flex-wrap items-center gap-4 text-muted-foreground">
          <a href={STATUS_URL} className="hover:text-foreground">
            Status
          </a>
          <a href={REPO_URL} className="hover:text-foreground">
            GitHub
          </a>
          <a href={`${REPO_URL}/blob/main/DEPLOYMENT.md`} className="hover:text-foreground">
            Deployment
          </a>
          <a href={`${REPO_URL}/blob/main/CONTRIBUTING.md`} className="hover:text-foreground">
            Contributing
          </a>
        </nav>
      </div>
    </footer>
  );
}

export { APP_URL, REPO_URL, STATUS_URL };
