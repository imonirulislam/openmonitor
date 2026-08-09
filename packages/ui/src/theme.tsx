"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { ThemeProvider as NextThemeProvider, useTheme } from "next-themes";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "./button";

export function ThemeProvider({
  children,
  defaultTheme = "system",
}: {
  children: ReactNode;
  defaultTheme?: "light" | "dark" | "system";
}) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}

/**
 * Theme toggle button.
 *
 * The icon and aria-label depend on the resolved theme, which `next-themes`
 * cannot know at SSR. Rendering the dynamic version on the server causes a
 * hydration mismatch when the client picks up the persisted/system theme.
 * We render a static placeholder until mounted, then swap in the real toggle.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        suppressHydrationWarning
        className={className}
      >
        <SunIcon className="hidden dark:block" />
        <MoonIcon className="block dark:hidden" />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      className={className}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}
