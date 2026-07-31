import { cn } from "@/lib/cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative block size-8 shrink-0 overflow-hidden", className)} aria-hidden>
      <img src="/open-vts-logo.png" alt="" className="openvts-logo absolute left-[-1px] top-1/2 h-[125%] w-auto max-w-none -translate-y-1/2" />
    </span>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center" aria-label="Open VTS">
      {compact ? <BrandMark /> : <img src="/open-vts-logo.png" alt="Open VTS" className="openvts-logo h-[34px] w-auto" />}
    </span>
  );
}
