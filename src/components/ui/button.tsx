import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({ className, variant = "primary", size = "md", loading, disabled, children, ...props }: ButtonProps) {
  const variants: Record<ButtonVariant, string> = {
    primary: "border-transparent bg-[var(--foreground)] text-[var(--background)] hover:opacity-86",
    secondary: "border-[var(--line)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--accent-soft)]",
    ghost: "border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--foreground)]",
    danger: "border-transparent bg-[var(--danger)] text-white hover:opacity-88",
  };
  const sizes: Record<ButtonSize, string> = {
    sm: "h-8 gap-1.5 rounded-lg px-3 text-xs",
    md: "h-10 gap-2 rounded-[10px] px-4 text-[13px]",
    lg: "h-12 gap-2 rounded-xl px-5 text-sm",
    icon: "size-10 rounded-[10px] p-0",
  };

  return (
    <button
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center border font-semibold transition-all duration-150 disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
