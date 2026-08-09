import { cn, ThemeProvider, Toaster, ToastFlash } from "@openmonitor/ui";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";
import { Suspense } from "react";
import "./globals.css";

export const metadata = {
  title: "OpenMonitor — Admin",
  description: "Status page admin dashboard",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn(GeistSans.variable, GeistMono.variable)} suppressHydrationWarning>
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
