"use client";

import {
  Avatar,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  useSidebar,
} from "@openmonitor/ui";
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState, useTransition } from "react";
import { signOutAction } from "~/lib/actions/auth";

export type SessionUser = {
  email?: string | null;
  name?: string | null;
  image?: string | null;
  role?: string | null;
};

/** Identity, appearance and sign-out, at the foot of the sidebar. */
export function UserMenu({ user }: { user: SessionUser }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { theme, setTheme } = useTheme();
  const [, startTransition] = useTransition();
  // next-themes only knows the stored theme on the client; radio state stays
  // unset until mount so SSR and the first paint agree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const display = user.name?.trim() || user.email?.split("@")[0] || "Account";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={collapsed ? display : undefined}
          className={cn(
            "flex items-center gap-2 rounded-md p-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50",
            collapsed ? "justify-center" : "w-full",
          )}
        >
          <Avatar size="sm" name={user.name} email={user.email} image={user.image} />
          {!collapsed ? (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-xs leading-none">{display}</span>
                <span className="mt-1 truncate text-[11px] text-muted-foreground leading-none">
                  {user.email}
                </span>
              </span>
              <ChevronsUpDownIcon className="size-3 shrink-0 text-muted-foreground" />
            </>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="w-60">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar size="md" name={user.name} email={user.email} image={user.image} />
          <div className="min-w-0">
            <div className="truncate font-medium text-sm">{display}</div>
            <div className="truncate text-muted-foreground text-xs">{user.email}</div>
          </div>
        </div>
        {user.role ? (
          <div className="px-2 pb-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
            {user.role} in this workspace
          </div>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/account" className="flex items-center gap-2">
            <UserIcon className="size-3.5" />
            Account
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex items-center gap-2">
            <SunIcon className="size-3.5 dark:hidden" />
            <MoonIcon className="hidden size-3.5 dark:block" />
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={mounted ? theme : undefined} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <SunIcon className="size-3.5" />
                Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <MoonIcon className="size-3.5" />
                Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <MonitorIcon className="size-3.5" />
                System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            // Radix unmounts the menu on select, which would kill a <form>
            // before its action ran — see workspace-switcher.tsx.
            e.preventDefault();
            startTransition(async () => {
              await signOutAction();
            });
          }}
          className="flex items-center gap-2"
        >
          <LogOutIcon className="size-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
