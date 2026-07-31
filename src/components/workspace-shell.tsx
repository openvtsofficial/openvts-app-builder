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
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center px-4 sm:px-7 lg:px-10">
          <Link href="/dashboard" aria-label="Open VTS applications"><Wordmark /></Link>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <div className="ml-1 flex items-center gap-2 border-l border-[var(--line)] pl-3">
              {user.image ? <img src={user.image} alt="" className="size-8 rounded-full object-cover" /> : <span className="grid size-8 place-items-center rounded-full bg-[var(--foreground)] text-[10px] font-bold text-[var(--background)]">{name.slice(0, 2).toUpperCase()}</span>}
              <span className="hidden max-w-36 truncate text-[11px] font-semibold lg:block">{name}</span>
              <button onClick={logout} className="grid size-8 place-items-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--foreground)]" aria-label="Log out" title="Log out"><LogOut className="size-3.5" /></button>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
