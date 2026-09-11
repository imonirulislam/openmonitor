"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeftIcon } from "lucide-react";
import {
  type ComponentProps,
  type ComponentPropsWithoutRef,
  createContext,
  type ElementRef,
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button } from "./button";
import { cn } from "./cn";
import { Sheet, SheetContent, SheetTitle } from "./sheet";

const MOBILE_BREAKPOINT = 768;

/** False during SSR and the first paint, so markup matches on hydration. */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isMobile;
}

/**
 * Minimal collapsible sidebar inspired by shadcn/ui's Sidebar but trimmed
 * down for our use:
 * - Two states: "expanded" (full width, ~240px) and "collapsed" (icon only).
 * - Persisted via document cookie (`sidebar_state=true|false`) so SSR and
 *   client agree on first paint.
 * - Keyboard shortcut: ⌘[ / Ctrl+[ to toggle.
 *
 * Skip mobile drawer mode — on small screens the layout falls back to the
 * expanded sidebar above the main content.
 */

const SIDEBAR_COOKIE = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const SIDEBAR_KEYBOARD_SHORTCUT = "[";
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_ICON = "3.5rem";

type SidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Below the md breakpoint the sidebar is a drawer with its own open state. */
  isMobile: boolean;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  toggleSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return ctx;
}

export function SidebarProvider({
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  children,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internal, setInternal] = useState(defaultOpen);
  const open = controlledOpen ?? internal;

  const setOpen = useCallback(
    (next: boolean) => {
      if (onOpenChange) onOpenChange(next);
      else setInternal(next);
      if (typeof document !== "undefined") {
        document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
      }
    },
    [onOpenChange],
  );

  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = useState(false);

  const toggleSidebar = useCallback(() => {
    if (isMobile) setOpenMobile((v) => !v);
    else setOpen(!open);
  }, [isMobile, open, setOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === SIDEBAR_KEYBOARD_SHORTCUT && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  const value = useMemo<SidebarContextValue>(
    () => ({
      state: open ? "expanded" : "collapsed",
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [open, setOpen, isMobile, openMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={value}>
      <div
        data-state={open ? "expanded" : "collapsed"}
        className={cn(
          "group/sidebar flex min-h-screen w-full",
          "[--sidebar-width:var(--sidebar-w,16rem)]",
          className,
        )}
        style={
          {
            "--sidebar-w": SIDEBAR_WIDTH,
            "--sidebar-w-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export const Sidebar = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const { state, isMobile, openMobile, setOpenMobile } = useSidebar();

    // Portalled, so the provider's collapsed-state group selectors don't reach
    // the drawer — it always renders in the expanded shape.
    if (isMobile) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile}>
          <SheetContent side="left" className="flex w-72 flex-col gap-0 p-0 sm:max-w-72">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {children}
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <aside
        ref={ref}
        data-state={state}
        className={cn(
          // Stick to the top of the viewport so the user/role/signout footer
          // stays in view as the main content scrolls. h-screen pins the
          // sidebar to viewport height, not document height.
          "sticky top-0 hidden h-screen flex-col border-border border-r bg-muted/30 transition-[width] duration-200 ease-in-out md:flex",
          "w-[var(--sidebar-w)] data-[state=collapsed]:w-[var(--sidebar-w-icon)]",
          className,
        )}
        {...props}
      >
        {children}
      </aside>
    );
  },
);
Sidebar.displayName = "Sidebar";

export const SidebarHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex h-14 items-center gap-2 border-border border-b px-2",
        "group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:px-0",
        className,
      )}
      {...props}
    />
  ),
);
SidebarHeader.displayName = "SidebarHeader";

export const SidebarContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-1 flex-col gap-1 overflow-y-auto p-2", className)}
      {...props}
    />
  ),
);
SidebarContent.displayName = "SidebarContent";

export const SidebarGroup = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-0.5", className)} {...props} />
  ),
);
SidebarGroup.displayName = "SidebarGroup";

/** Section heading above a group of menu buttons. Hidden when collapsed. */
export const SidebarGroupLabel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "px-2.5 pt-3 pb-1 font-mono text-[10px] text-muted-foreground/70 uppercase tracking-wider",
        "group-data-[state=collapsed]/sidebar:hidden",
        className,
      )}
      {...props}
    />
  ),
);
SidebarGroupLabel.displayName = "SidebarGroupLabel";

/** Divider standing in for a group label when the sidebar is collapsed. */
export const SidebarGroupDivider = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "mx-auto my-2 hidden w-6 border-border border-t",
        "group-data-[state=collapsed]/sidebar:block",
        className,
      )}
      {...props}
    />
  ),
);
SidebarGroupDivider.displayName = "SidebarGroupDivider";

export const SidebarFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("border-t border-border p-2", className)} {...props} />
  ),
);
SidebarFooter.displayName = "SidebarFooter";

export const SidebarInset = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <main ref={ref} className={cn("flex-1 overflow-x-hidden", className)} {...props} />
  ),
);
SidebarInset.displayName = "SidebarInset";

const sidebarMenuButtonVariants = cva(
  "flex w-full items-center gap-2 overflow-hidden rounded-md px-2.5 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      isActive: {
        true: "bg-accent font-medium text-accent-foreground",
        false: "text-muted-foreground hover:text-foreground",
      },
    },
    defaultVariants: { isActive: false },
  },
);

type SidebarMenuButtonProps = ComponentProps<"button"> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    asChild?: boolean;
    tooltip?: string;
  };

/**
 * Button row inside the sidebar. Supports `asChild` for use with Next.js Link.
 * `tooltip` is shown when the sidebar is collapsed (icon-only state).
 */
export const SidebarMenuButton = forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ className, isActive, asChild, tooltip, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const { state } = useSidebar();
    return (
      <Comp
        ref={ref as never}
        data-active={isActive}
        title={state === "collapsed" ? tooltip : undefined}
        className={cn(
          sidebarMenuButtonVariants({ isActive }),
          "group-data-[state=collapsed]/sidebar:[&>span]:hidden group-data-[state=collapsed]/sidebar:justify-center",
          className,
        )}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);
SidebarMenuButton.displayName = "SidebarMenuButton";

/** Top bar carrying the drawer trigger. Only rendered below the md breakpoint. */
export const SidebarMobileHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-2 border-border border-b bg-background/95 px-3 backdrop-blur md:hidden",
        className,
      )}
      {...props}
    >
      <SidebarTrigger />
      {children}
    </div>
  ),
);
SidebarMobileHeader.displayName = "SidebarMobileHeader";

/** Toggle button — pair with useSidebar() somewhere in the chrome. */
export const SidebarTrigger = forwardRef<
  ElementRef<typeof Button>,
  ComponentPropsWithoutRef<typeof Button>
>(({ className, onClick, ...props }, ref) => {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      onClick={(e) => {
        toggleSidebar();
        onClick?.(e);
      }}
      className={cn("size-7", className)}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle sidebar (⌘[)</span>
    </Button>
  );
});
SidebarTrigger.displayName = "SidebarTrigger";

export type { ReactNode };
