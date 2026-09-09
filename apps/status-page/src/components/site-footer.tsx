import { TimeZoneLabel } from "./time-zone-label";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5002";

/**
 * One-line footer: page identity and zone on the left, links and attribution
 * on the right. Links render only when the page has them set.
 */
export function SiteFooter({
  title,
  host,
  contactUrl,
  homepageUrl,
}: {
  title: string;
  host?: string;
  contactUrl?: string | null;
  homepageUrl?: string | null;
}) {
  // The feed route resolves the same way /v1/status does, so handing it this
  // page's host gets the right feed without adding a field to the payload.
  const feedUrl = `${API_URL}/v1/feed.xml${host ? `?host=${encodeURIComponent(host)}` : ""}`;

  const links = [
    contactUrl ? { label: "Contact", href: contactUrl } : null,
    homepageUrl ? { label: "Homepage", href: homepageUrl } : null,
    { label: "RSS", href: feedUrl },
  ].filter((l): l is { label: string; href: string } => l !== null);

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex min-h-12 w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-muted-foreground text-xs">
        <span className="font-mono">
          {title} · <TimeZoneLabel />
        </span>
        <span className="flex items-center gap-1.5">
          {links.map((link) => (
            <span key={link.label} className="flex items-center gap-1.5">
              <a
                href={link.href}
                className="transition-colors hover:text-foreground"
                {...(link.label === "RSS" ? {} : { rel: "noreferrer" })}
              >
                {link.label}
              </a>
              <span aria-hidden>·</span>
            </span>
          ))}
          <a
            href="https://github.com/imonirulislam/openmonitor"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Powered by OpenMonitor
          </a>
        </span>
      </div>
    </footer>
  );
}
