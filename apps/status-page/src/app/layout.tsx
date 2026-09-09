import { cn, ThemeProvider } from "@openmonitor/ui";
import localFont from "next/font/local";
import type { CSSProperties, ReactNode } from "react";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { pageIdentity } from "~/lib/page-identity";
import "./globals.css";

/**
 * JetBrains Mono, used for everything — this is a monitoring tool, and the UI is
 * mostly timestamps, regions, slugs, status values and uppercase micro-labels.
 * A mono face reads as native here, and JetBrains Mono was drawn for legibility
 * at the small sizes those use.
 *
 * The file is committed under public/fonts rather than pulled from a package or
 * next/font/google, so a `docker build` needs no network access to fetch it and
 * the exact file is pinned in the repo. One variable woff2 covers every weight,
 * which is why there is no separate bold.
 *
 * `--font-sans` is aliased to it on <html> below: @theme maps both Tailwind
 * families to these variables, so aliasing is what makes `font-sans` resolve
 * here too, without every existing `font-sans` class having to change.
 */
const jetbrainsMono = localFont({
  src: "../../public/fonts/JetBrainsMono-Variable.woff2",
  variable: "--font-mono",
  display: "swap",
  weight: "100 800",
  // next/font otherwise metric-matches against Arial, so text renders
  // proportional during the swap window on a UI that is entirely monospace.
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

const TITLE = process.env.NEXT_PUBLIC_STATUS_TITLE ?? "OpenMonitor";
const DESCRIPTION =
  process.env.NEXT_PUBLIC_STATUS_DESCRIPTION ?? "Live status for OpenMonitor services";

export const metadata = { title: TITLE, description: DESCRIPTION };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const page = await pageIdentity();

  return (
    <html
      lang="en"
      className={cn(jetbrainsMono.variable)}
      style={{ "--font-sans": "var(--font-mono)" } as CSSProperties}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider defaultTheme="dark">
          <div className="flex min-h-screen flex-col">
            <SiteHeader title={page.title} />
            <div className="flex-1">{children}</div>
            <SiteFooter
              title={page.title}
              host={page.host}
              contactUrl={page.contactUrl}
              homepageUrl={page.homepageUrl}
            />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
