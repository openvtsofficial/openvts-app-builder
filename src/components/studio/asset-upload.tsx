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
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2.5">
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={() => input.current?.click()} className={cn("grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--background)]", value && "border-solid")}>
          {value ? <img src={value} alt="" className="max-h-7 max-w-7 object-contain" /> : <ImageIcon className="size-3.5 text-[var(--subtle)]" />}
        </button>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-bold">{label}</p><p className="mt-0.5 text-[9px] leading-3 text-[var(--muted)]">{description}</p></div>
        {value ? <button type="button" onClick={() => onChange(undefined)} className="grid size-6 place-items-center rounded-md text-[var(--subtle)] hover:bg-[var(--accent-soft)]"><X className="size-3" /></button> : <button type="button" onClick={() => input.current?.click()} className="text-[9px] font-bold underline underline-offset-3">Upload</button>}
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
    <div className={cn("rounded-lg border border-dashed p-3 transition", valid ? "border-[var(--success)] bg-[var(--success-soft)]" : "border-[var(--line-strong)] bg-[var(--surface)] hover:border-[var(--foreground)]")}>
      {name ? (
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--surface)] shadow-sm">{previewUrl ? <img src={previewUrl} alt="Icon preview" className="size-full object-cover" /> : <FileArchive className="size-3.5" />}</span>
          <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[10px] font-bold"><span className="truncate">{name}</span>{valid ? <Check className="size-3 text-[var(--success)]" /> : null}</span><span className="mt-0.5 block text-[9px] leading-3 text-[var(--muted)]">{details}</span></span>
          <button type="button" onClick={onRemove} className="grid size-6 place-items-center rounded-md hover:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]"><X className="size-3" /></button>
        </div>
      ) : (
        <div className="py-2 text-center"><span className="mx-auto grid size-8 place-items-center rounded-lg bg-[var(--accent-soft)]"><UploadCloud className={cn("size-3.5", busy && "animate-pulse")} /></span><p className="mt-2 text-[10px] font-bold">Upload Icon Kitchen output</p><p className="mx-auto mt-1 max-w-xs text-[9px] leading-3 text-[var(--muted)]">Upload the ZIP or choose the extracted folder.</p><div className="mt-3 flex justify-center gap-2"><button type="button" onClick={() => zipInput.current?.click()} className="rounded-md bg-[var(--foreground)] px-2.5 py-1.5 text-[9px] font-bold text-[var(--background)]">Choose ZIP</button><button type="button" onClick={() => folderInput.current?.click()} className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-[9px] font-bold">Choose folder</button></div></div>
      )}
      <input ref={zipInput} type="file" accept=".zip,application/zip" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onZip(file); }} />
      <input ref={(node) => { folderInput.current = node; if (node) { node.setAttribute("webkitdirectory", ""); node.setAttribute("directory", ""); } }} type="file" multiple className="hidden" onChange={(event) => { if (event.target.files?.length) onFolder(event.target.files); }} />
    </div>
  );
}
