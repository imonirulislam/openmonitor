import type { ReactNode } from "react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider, cn } from "@openmonitor/ui";
import { SiteFooter, SiteHeader } from "~/components/site-header";
import "./globals.css";

const TITLE = process.env.NEXT_PUBLIC_STATUS_TITLE ?? "OpenMonitor";
const DESCRIPTION =
  process.env.NEXT_PUBLIC_STATUS_DESCRIPTION ?? "Live status for OpenMonitor services";

export const metadata = { title: TITLE, description: DESCRIPTION };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn(GeistSans.variable, GeistMono.variable)} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider defaultTheme="dark">
          <div className="flex min-h-screen flex-col">
            <SiteHeader title={TITLE} />
            <div className="flex-1">{children}</div>
            <SiteFooter title={TITLE} />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
