import { cn } from "@/lib/cn";

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger"; className?: string }) {
  const tones = {
    neutral: "bg-[var(--accent-soft)] text-[var(--muted)]",
    success: "bg-[var(--success-soft)] text-[var(--success)]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
    danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.06em]", tones[tone], className)}>{children}</span>;
}
