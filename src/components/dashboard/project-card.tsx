"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Clock3, Package, Smartphone, Trash2 } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { useStudio } from "@/components/studio-provider";
import type { StudioProject } from "@/lib/types";

function relativeDate(value: string) {
  const hours = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 3_600_000));
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ProjectCard({ project }: { project: StudioProject }) {
  const { deleteProject } = useStudio();
  const [confirming, setConfirming] = useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    void deleteProject(project.id);
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
  };

  return (
    <div className="group relative grid gap-3 px-3 py-3 transition hover:bg-[var(--surface-elevated)] sm:grid-cols-[minmax(200px,1.25fr)_minmax(170px,1fr)_auto] sm:items-center sm:px-4">
      <Link href={`/projects/${project.id}`} className="absolute inset-0" aria-label={`Open ${project.name}`} />
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-elevated)]">{project.iconPreviewUrl ? <img src={project.iconPreviewUrl} alt="" className="size-full object-cover" /> : <BrandMark className="size-5" />}</span>
        <span className="min-w-0"><span className="flex items-center gap-2"><span className="truncate text-[12px] font-bold">{project.name}</span><Badge tone={project.status === "FAILED" ? "danger" : project.status === "BUILDING" ? "warning" : "neutral"}>{project.status === "BUILDING" ? "Building" : project.status === "FAILED" ? "Failed" : `Rev ${project.configurationRevision}`}</Badge></span><span className="mt-0.5 flex items-center gap-1 text-[9px] text-[var(--muted)]"><Clock3 className="size-2.5" />Updated {relativeDate(project.updatedAt)}</span></span>
      </div>
      <div className="grid min-w-0 gap-1 text-[9px] text-[var(--muted)]"><span className="flex min-w-0 items-center gap-1.5"><Package className="size-3 shrink-0" /><code className="truncate">{project.androidPackageName}</code></span><span className="flex min-w-0 items-center gap-1.5"><Smartphone className="size-3 shrink-0" /><code className="truncate">{project.iosBundleId}</code></span></div>
      <div className="relative z-10 flex items-center justify-end gap-1.5">
        {confirming ? (
          <span className="flex items-center gap-1">
            <button onClick={cancelDelete} className="rounded-md px-2 py-1 text-[9px] font-medium text-[var(--muted)] transition hover:bg-[var(--accent-soft)]">Cancel</button>
            <button onClick={handleDelete} className="rounded-md bg-red-600 px-2 py-1 text-[9px] font-bold text-white transition hover:bg-red-700">Delete</button>
          </span>
        ) : (
          <>
            <button onClick={handleDelete} className="grid size-7 place-items-center rounded-md text-[var(--muted)] opacity-0 transition hover:bg-red-100 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-950" aria-label={`Delete ${project.name}`} title="Delete project"><Trash2 className="size-3" /></button>
            <span className="flex items-center gap-1.5 text-[9px] font-bold">Open <ArrowRight className="size-3 transition group-hover:translate-x-0.5" /></span>
          </>
        )}
      </div>
    </div>
  );
}
