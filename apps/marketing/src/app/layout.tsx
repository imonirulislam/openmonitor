import { cn, ThemeProvider } from "@openmonitor/ui";
import type { Metadata } from "next";
import localFont from "next/font/local";
import type { CSSProperties, ReactNode } from "react";
import { SiteFooter, SiteHeader } from "~/components/site-chrome";
import "./globals.css";

/**
 * Same JetBrains Mono setup as the dashboard and status page, committed under
 * public/fonts rather than fetched at build time. Marketing looking like the
 * product is the point — someone arriving from the landing page should
 * recognise the app they sign in to.
 */
const jetbrainsMono = localFont({
  src: "../../public/fonts/JetBrainsMono-Variable.woff2",
  variable: "--font-mono",
  display: "swap",
  weight: "100 800",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

export const metadata: Metadata = {
  title: "OpenMonitor — open-source uptime monitoring and status pages",
  description:
    "Monitor HTTP, TCP and DNS endpoints from multiple regions, publish a status page, " +
    "and get alerted in Slack. Self-host it or run it on a free tier. AGPL-3.0.",
  openGraph: {
    title: "OpenMonitor",
    description: "Open-source uptime monitoring and status pages you can self-host.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(jetbrainsMono.variable)}
      style={{ "--font-sans": "var(--font-mono)" } as CSSProperties}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
