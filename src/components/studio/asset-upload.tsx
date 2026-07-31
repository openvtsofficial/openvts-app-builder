"use client";

import { Check, FileArchive, ImageIcon, UploadCloud, X } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/cn";

export function LogoUpload({ label, description, value, onChange }: { label: string; description: string; value?: string; onChange: (dataUrl?: string, file?: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const select = (file?: File) => {
    if (!file) return;
    if (!file.type.match(/^image\/(png|svg\+xml|webp|jpeg)$/) || file.size > 2_000_000) return;
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result), file);
    reader.readAsDataURL(file);
  };
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => input.current?.click()} className={cn("grid size-12 shrink-0 place-items-center overflow-hidden rounded-[11px] border border-dashed border-[var(--line-strong)] bg-[var(--background)]", value && "border-solid")}>
          {value ? <img src={value} alt="" className="max-h-9 max-w-9 object-contain" /> : <ImageIcon className="size-4 text-[var(--subtle)]" />}
        </button>
        <div className="min-w-0 flex-1"><p className="text-[11px] font-bold">{label}</p><p className="mt-0.5 text-[9px] leading-4 text-[var(--muted)]">{description}</p></div>
        {value ? <button type="button" onClick={() => onChange(undefined)} className="grid size-7 place-items-center rounded-lg text-[var(--subtle)] hover:bg-[var(--accent-soft)]"><X className="size-3" /></button> : <button type="button" onClick={() => input.current?.click()} className="text-[9px] font-bold underline underline-offset-4">Upload</button>}
      </div>
      <input ref={input} type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" className="hidden" onChange={(event) => select(event.target.files?.[0])} />
    </div>
  );
}

export function IconArchiveUpload({ valid, name, details, previewUrl, busy, onZip, onFolder, onRemove }: {
  valid?: boolean;
  name?: string;
  details?: string;
  previewUrl?: string;
  busy?: boolean;
  onZip: (file: File) => void;
  onFolder: (files: FileList) => void;
  onRemove: () => void;
}) {
  const zipInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  return (
    <div className={cn("rounded-xl border border-dashed p-4 transition", valid ? "border-[var(--success)] bg-[var(--success-soft)]" : "border-[var(--line-strong)] bg-[var(--surface)] hover:border-[var(--foreground)]")}>
      {name ? (
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--surface)] shadow-sm">{previewUrl ? <img src={previewUrl} alt="Icon preview" className="size-full object-cover" /> : <FileArchive className="size-4" />}</span>
          <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-[11px] font-bold"><span className="truncate">{name}</span>{valid ? <Check className="size-3 text-[var(--success)]" /> : null}</span><span className="mt-1 block text-[9px] leading-4 text-[var(--muted)]">{details}</span></span>
          <button type="button" onClick={onRemove} className="grid size-7 place-items-center rounded-lg hover:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]"><X className="size-3" /></button>
        </div>
      ) : (
        <div className="py-3 text-center"><span className="mx-auto grid size-10 place-items-center rounded-xl bg-[var(--accent-soft)]"><UploadCloud className={cn("size-4", busy && "animate-pulse")} /></span><p className="mt-3 text-[11px] font-bold">Upload Icon Kitchen output</p><p className="mx-auto mt-1 max-w-xs text-[9px] leading-4 text-[var(--muted)]">Upload the downloaded ZIP or choose the extracted folder. Android and iOS manifests are checked automatically.</p><div className="mt-4 flex justify-center gap-2"><button type="button" onClick={() => zipInput.current?.click()} className="rounded-lg bg-[var(--foreground)] px-3 py-2 text-[9px] font-bold text-[var(--background)]">Choose ZIP</button><button type="button" onClick={() => folderInput.current?.click()} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[9px] font-bold">Choose folder</button></div></div>
      )}
      <input ref={zipInput} type="file" accept=".zip,application/zip" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onZip(file); }} />
      <input ref={(node) => { folderInput.current = node; if (node) { node.setAttribute("webkitdirectory", ""); node.setAttribute("directory", ""); } }} type="file" multiple className="hidden" onChange={(event) => { if (event.target.files?.length) onFolder(event.target.files); }} />
    </div>
  );
}
