"use client";

import Link from "next/link";
import { Boxes, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ProjectCard } from "@/components/dashboard/project-card";
import { useStudio } from "@/components/studio-provider";
import { Button } from "@/components/ui/button";

export function Dashboard() {
  const { projects, loading } = useStudio();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return projects;
    return projects.filter((project) => `${project.name} ${project.androidApplicationName} ${project.iosApplicationName} ${project.androidPackageName} ${project.iosBundleId}`.toLowerCase().includes(search));
  }, [projects, query]);

  return (
    <div className="enter-up mx-auto max-w-[1080px]">
      <section className="flex flex-col gap-3 border-b border-[var(--line)] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-.04em]">Applications</h1>
          <p className="mt-0.5 text-[10px] text-[var(--muted)]">{projects.length} {projects.length === 1 ? "project" : "projects"}</p>
        </div>
        <Link href="/projects/new"><Button size="sm"><Plus className="size-3.5" />Create application</Button></Link>
      </section>

      <section className="mt-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--subtle)]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" aria-label="Search projects" className="h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] pl-8 pr-3 text-[11px] outline-none transition focus:border-[var(--foreground)]" />
        </div>

        {loading ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">{[1, 2, 3].map((item) => <div key={item} className="skeleton-shimmer h-[72px] border-b border-[var(--line)] last:border-0" />)}</div>
        ) : filtered.length ? (
          <div className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)]">{filtered.map((project) => <ProjectCard key={project.id} project={project} />)}</div>
        ) : (
          <div className="mt-4 grid min-h-48 place-items-center rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-6 text-center"><div><span className="mx-auto grid size-9 place-items-center rounded-lg bg-[var(--accent-soft)]"><Boxes className="size-3.5" /></span><h2 className="mt-3 text-[12px] font-bold">{query ? "No matching projects" : "No projects yet"}</h2><p className="mt-1 text-[9px] text-[var(--muted)]">{query ? "Try a different search." : "Create your first application to begin."}</p>{!query ? <Link href="/projects/new" className="mt-3 inline-flex text-[9px] font-bold underline underline-offset-4">Create application</Link> : null}</div></div>
        )}
      </section>
    </div>
  );
}
