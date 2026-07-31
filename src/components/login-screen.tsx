import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { signIn } from "@/auth";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { isDemoMode } from "@/lib/env";

export function LoginScreen() {
  return (
    <main className="quiet-grid relative grid min-h-screen place-items-center bg-[var(--background)] px-5 py-12">
      <div className="absolute right-5 top-5"><ThemeToggle /></div>
      <section className="w-full max-w-[420px] rounded-[24px] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] p-7 shadow-[var(--shadow-float)] backdrop-blur-xl sm:p-9">
        <Wordmark />
        <h1 className="mt-10 text-[30px] font-semibold tracking-[-.05em]">Application Studio</h1>
        <p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">Sign in to create, customize and build your mobile applications.</p>
        <div className="mt-8 grid gap-3">
          <form action={async () => { "use server"; await signIn("google", { redirectTo: "/dashboard" }); }}>
            <Button size="lg" className="w-full justify-between" type="submit"><span className="flex items-center gap-3"><span className="grid size-6 place-items-center rounded-full bg-white text-[11px] font-bold text-black">G</span>Continue with Google</span><ArrowRight className="size-4" /></Button>
          </form>
          {isDemoMode ? <Link href="/dashboard" className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12px] font-semibold transition hover:bg-[var(--accent-soft)]">Open demo</Link> : null}
        </div>
      </section>
    </main>
  );
}
