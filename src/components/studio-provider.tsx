"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ProjectInput } from "@/lib/validation";
import { slugify } from "@/lib/validation";
import type { StudioProject } from "@/lib/types";

const STORAGE_KEY = "openvts-app-studio-projects-v1";
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

const starterProjects: StudioProject[] = [
  {
    id: "demo-northstar",
    name: "Northstar Fleet",
    slug: "northstar-fleet",
    description: "Field operations application for Northstar Logistics.",
    androidApplicationName: "Northstar Fleet",
    iosApplicationName: "Northstar Fleet",
    androidPackageName: "com.northstar.fleet",
    iosBundleId: "com.northstar.fleet",
    accentColor: "#171716",
    templateVersion: "1.0.0",
    configurationRevision: 1,
    status: "READY",
    createdAt: "2026-07-08T08:30:00.000Z",
    updatedAt: "2026-07-13T09:18:00.000Z",
  },
  {
    id: "demo-atlas",
    name: "Atlas Track",
    slug: "atlas-track",
    description: "White-label mobile experience for Atlas Mobility.",
    androidApplicationName: "Atlas Track",
    iosApplicationName: "Atlas Track",
    androidPackageName: "io.atlas.track",
    iosBundleId: "io.atlas.track",
    accentColor: "#2847C7",
    templateVersion: "1.0.0",
    configurationRevision: 1,
    status: "DRAFT",
    createdAt: "2026-07-11T12:00:00.000Z",
    updatedAt: "2026-07-12T18:42:00.000Z",
  },
];

interface StudioContextValue {
  projects: StudioProject[];
  loading: boolean;
  createProject: (input: ProjectInput) => Promise<StudioProject>;
  updateProject: (id: string, changes: Partial<StudioProject>) => Promise<StudioProject>;
  deleteProject: (id: string) => Promise<void>;
  syncProject: (project: StudioProject) => void;
  getProject: (id: string) => StudioProject | undefined;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (DEMO_MODE) {
        const saved = localStorage.getItem(STORAGE_KEY);
        const next = saved ? (JSON.parse(saved) as StudioProject[]).map((project) => ({ ...project, configurationRevision: project.configurationRevision ?? 1 })) : starterProjects;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        if (!cancelled) setProjects(next);
      } else {
        const response = await fetch("/api/projects", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load projects");
        const payload = (await response.json()) as { projects: StudioProject[] };
        if (!cancelled) setProjects(payload.projects);
      }
      if (!cancelled) setLoading(false);
    }
    load().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback((next: StudioProject[]) => {
    setProjects(next);
    if (DEMO_MODE) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const createProject = useCallback(async (input: ProjectInput) => {
    if (!DEMO_MODE) {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!response.ok) throw new Error("Could not create project");
      const payload = (await response.json()) as { project: StudioProject };
      setProjects((current) => [payload.project, ...current]);
      return payload.project;
    }
    const now = new Date().toISOString();
    const project: StudioProject = {
      id: crypto.randomUUID(),
      slug: `${slugify(input.name)}-${Date.now().toString(36).slice(-4)}`,
      status: "DRAFT",
      templateVersion: "1.0.0",
      configurationRevision: 1,
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    persist([project, ...projects]);
    return project;
  }, [persist, projects]);

  const updateProject = useCallback(async (id: string, changes: Partial<StudioProject>) => {
    if (!DEMO_MODE) {
      const response = await fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
      if (!response.ok) throw new Error("Could not save project");
      const payload = (await response.json()) as { project: StudioProject };
      setProjects((current) => current.map((item) => item.id === id ? payload.project : item));
      return payload.project;
    }
    const current = projects.find((item) => item.id === id)!;
    const updated = { ...current, ...changes, configurationRevision: current.configurationRevision + 1, status: "DRAFT" as const, updatedAt: new Date().toISOString() };
    persist(projects.map((item) => item.id === id ? updated : item));
    return updated;
  }, [persist, projects]);

  const deleteProject = useCallback(async (id: string) => {
    if (!DEMO_MODE) {
      const response = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete project");
    }
    persist(projects.filter((item) => item.id !== id));
  }, [persist, projects]);

  const syncProject = useCallback((project: StudioProject) => {
    persist(projects.map((item) => item.id === project.id ? project : item));
  }, [persist, projects]);

  const value = useMemo<StudioContextValue>(() => ({
    projects,
    loading,
    createProject,
    updateProject,
    deleteProject,
    syncProject,
    getProject: (id) => projects.find((project) => project.id === id),
  }), [createProject, deleteProject, loading, projects, syncProject, updateProject]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used inside StudioProvider");
  return context;
}
