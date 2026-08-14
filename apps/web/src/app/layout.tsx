import { cn, ThemeProvider, Toaster, ToastFlash } from "@openmonitor/ui";
import localFont from "next/font/local";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { CSSProperties, ReactNode } from "react";
import { Suspense } from "react";
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

export const metadata = {
  title: "OpenMonitor — Admin",
  description: "Status page admin dashboard",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={cn(jetbrainsMono.variable)}
      style={{ "--font-sans": "var(--font-mono)" } as CSSProperties}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <NuqsAdapter>
          <ThemeProvider defaultTheme="system">
            {children}
            <Toaster position="bottom-right" />
            <Suspense fallback={null}>
              <ToastFlash />
            </Suspense>
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
