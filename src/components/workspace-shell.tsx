"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export function WorkspaceShell({ children, user }: { children: React.ReactNode; user: { name?: string | null; email?: string | null; image?: string | null } }) {
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
  const name = user.name || "Demo User";

  const logout = () => {
    if (demo) window.location.href = "/";
    else void signOut({ callbackUrl: "/" });
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-12 w-full max-w-[1320px] items-center px-4 sm:px-5 lg:px-8">
          <Link href="/dashboard" aria-label="Open VTS applications"><Wordmark compact /></Link>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <div className="ml-1 flex items-center gap-1.5 border-l border-[var(--line)] pl-2.5">
              {user.image ? <img src={user.image} alt="" className="size-6 rounded-full object-cover" /> : <span className="grid size-6 place-items-center rounded-full bg-[var(--foreground)] text-[9px] font-bold text-[var(--background)]">{name.slice(0, 2).toUpperCase()}</span>}
              <span className="hidden max-w-32 truncate text-[10px] font-medium lg:block">{name}</span>
              <button onClick={logout} className="grid size-7 place-items-center rounded-md text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--foreground)]" aria-label="Log out" title="Log out"><LogOut className="size-3" /></button>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-5 lg:px-8 lg:py-6">{children}</main>
    </div>
  );
}
