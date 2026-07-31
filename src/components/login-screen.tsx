import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { signIn } from "@/auth";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { isDemoMode } from "@/lib/env";

export function LoginScreen() {
  return (
    <main className="quiet-grid relative grid min-h-screen place-items-center bg-[var(--background)] px-4 py-10">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <section className="w-full max-w-[360px] rounded-xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] p-6 shadow-[var(--shadow-float)] backdrop-blur-xl sm:p-7">
        <Wordmark />
        <h1 className="mt-7 text-[22px] font-semibold tracking-[-.04em]">Application Studio</h1>
        <p className="mt-1.5 text-[11px] leading-4 text-[var(--muted)]">Sign in to create, customize and build your mobile applications.</p>
        <div className="mt-6 grid gap-2.5">
          <form action={async () => { "use server"; await signIn("google", { redirectTo: "/dashboard" }); }}>
            <Button size="lg" className="w-full justify-between" type="submit"><span className="flex items-center gap-2.5"><span className="grid size-5 place-items-center rounded-full bg-white text-[10px] font-bold text-black">G</span>Continue with Google</span><ArrowRight className="size-3.5" /></Button>
          </form>
          {isDemoMode ? <Link href="/dashboard" className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[11px] font-semibold transition hover:bg-[var(--accent-soft)]">Open demo</Link> : null}
        </div>
      </section>
    </main>
  );
}
