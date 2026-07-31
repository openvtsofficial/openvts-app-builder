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
    <label className="grid gap-1.5">
      <span className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[var(--foreground)]">
        {label}
        {optional ? <span className="font-normal text-[var(--subtle)]">Optional</span> : null}
      </span>
      {children}
      {error ? <span className="text-[10px] text-[var(--danger)]">{error}</span> : hint ? <span className="text-[10px] leading-4 text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-8 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[12px] text-[var(--foreground)] transition placeholder:text-[var(--subtle)] hover:border-[var(--line-strong)] focus:border-[var(--foreground)] focus:outline-none",
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
        "min-h-20 w-full resize-none rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-[12px] leading-5 text-[var(--foreground)] placeholder:text-[var(--subtle)] hover:border-[var(--line-strong)] focus:border-[var(--foreground)] focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
