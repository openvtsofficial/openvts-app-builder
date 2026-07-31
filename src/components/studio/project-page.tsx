"use client";

import Link from "next/link";
import { ArrowLeft, FolderX } from "lucide-react";
import { ProjectStudio } from "@/components/studio/project-studio";
import { useStudio } from "@/components/studio-provider";

export function ProjectPage({ id }: { id: string }) {
  const { getProject, loading } = useStudio();
  const project = getProject(id);
  if (loading) return <div className="grid gap-4"><div className="skeleton-shimmer h-20 rounded-[18px]" /><div className="grid gap-5 xl:grid-cols-2"><div className="skeleton-shimmer h-[660px] rounded-[22px]" /><div className="skeleton-shimmer h-[660px] rounded-[22px]" /></div></div>;
  if (!project) return <div className="card grid min-h-[60vh] place-items-center p-8 text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--accent-soft)]"><FolderX className="size-5" /></span><h1 className="mt-5 text-xl font-bold tracking-[-.04em]">Application not found</h1><p className="mt-2 text-[11px] text-[var(--muted)]">It may have been removed or belongs to another workspace.</p><Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 text-[11px] font-bold"><ArrowLeft className="size-3" />Return to dashboard</Link></div></div>;
  return <ProjectStudio project={project} />;
}
