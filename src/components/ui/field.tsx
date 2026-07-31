import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}

export function FieldShell({ label, hint, error, optional, children }: FieldShellProps) {
  return (
    <label className="grid gap-2">
      <span className="flex items-center justify-between gap-3 text-[12px] font-semibold text-[var(--foreground)]">
        {label}
        {optional ? <span className="font-normal text-[var(--subtle)]">Optional</span> : null}
      </span>
      {children}
      {error ? <span className="text-[11px] text-[var(--danger)]">{error}</span> : hint ? <span className="text-[11px] leading-4 text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[13px] text-[var(--foreground)] shadow-[0_1px_1px_rgb(0_0_0/2%)] transition placeholder:text-[var(--subtle)] hover:border-[var(--line-strong)] focus:border-[var(--foreground)] focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full resize-none rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[13px] leading-5 text-[var(--foreground)] placeholder:text-[var(--subtle)] hover:border-[var(--line-strong)] focus:border-[var(--foreground)] focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
