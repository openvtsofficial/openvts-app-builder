"use client";

import JSZip from "jszip";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Apple, Archive, ArrowLeft, Box, Check, CheckCircle2, Clock3, Code2, Download, Globe, Hammer, ImageIcon, LoaderCircle, PackageCheck, Save, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { AppPreview } from "@/components/studio/app-preview";
import { IconArchiveUpload, LogoUpload } from "@/components/studio/asset-upload";
import { useStudio } from "@/components/studio-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldShell, Input, Textarea } from "@/components/ui/field";
import { currentBuildFor, isBuildRunning, latestSuccessfulBuild } from "@/lib/build-freshness";
import { cn } from "@/lib/cn";
import { inspectIconKitchenPaths, inspectIconKitchenZip } from "@/lib/icon-kitchen";
import type { BuildStatus, BuildType, StudioBuild, StudioProject } from "@/lib/types";
import { projectSchema } from "@/lib/validation";

type Tab = "identity" | "branding" | "build";
type UrlStatus = "idle" | "validating" | "valid" | "invalid";
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

function useApiUrlValidation() {
  const [status, setStatus] = useState<UrlStatus>("idle");
  const [message, setMessage] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const validate = (url: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!url || url.length < 10) { setStatus("idle"); setMessage(""); return; }
    setStatus("validating"); setMessage("");
    timerRef.current = setTimeout(async () => {
      try {
        const response = await fetch("/api/validate-api-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
        const result = await response.json();
        if (result.valid) { setStatus("valid"); setMessage("API is reachable"); }
        else { setStatus("invalid"); setMessage(result.error || "Unreachable"); }
      } catch { setStatus("invalid"); setMessage("Validation request failed"); }
    }, 800);
  };
  return { status, message, validate };
}

const resources: { type: BuildType; label: string; copy: string; icon: typeof Box }[] = [
  { type: "DEBUG_APK", label: "Debug APK", copy: "Install directly for testing", icon: Box },
  { type: "RELEASE_APK", label: "Release APK", copy: "Optimized Android package", icon: Smartphone },
  { type: "SIGNED_APK", label: "Signed APK", copy: "Signed with bundled release key", icon: ShieldCheck },
  { type: "RELEASE_AAB", label: "Android App Bundle", copy: "Ready for Google Play", icon: PackageCheck },
  { type: "SOURCE_ZIP", label: "Source code", copy: "Customized Flutter project", icon: Archive },
];

const buildLabels = Object.fromEntries(resources.map((resource) => [resource.type, resource.label])) as Record<BuildType, string>;
const buildSteps: { status: BuildStatus; label: string; progress: number; delay: number }[] = [
  { status: "QUEUED", label: "Waiting for an available build runner", progress: 4, delay: 450 },
  { status: "PREPARING", label: "Preparing the Flutter project", progress: 15, delay: 650 },
  { status: "CUSTOMIZING", label: "Applying names, logos and launcher icons", progress: 32, delay: 750 },
  { status: "RESOLVING_DEPENDENCIES", label: "Resolving dependencies", progress: 48, delay: 700 },
  { status: "COMPILING", label: "Compiling the resource", progress: 76, delay: 1000 },
  { status: "SIGNING", label: "Verifying the release signature", progress: 89, delay: 550 },
  { status: "UPLOADING", label: "Publishing the download", progress: 97, delay: 450 },
];

function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function demoBuildKey(projectId: string) { return `openvts-app-studio-builds-v2-${projectId}`; }
function readDemoBuilds(projectId: string) {
  if (!DEMO_MODE || typeof window === "undefined") return [];
  const stored = localStorage.getItem(demoBuildKey(projectId));
  if (!stored) return [];
  try { return (JSON.parse(stored) as StudioBuild[]).filter((build) => typeof build.projectRevision === "number"); }
  catch { localStorage.removeItem(demoBuildKey(projectId)); return []; }
}

export function ProjectStudio({ project }: { project: StudioProject }) {
  const { updateProject, syncProject } = useStudio();
  const [baseline, setBaseline] = useState(project);
  const [draft, setDraft] = useState(project);
  const [tab, setTab] = useState<Tab>("identity");
  const [platform, setPlatform] = useState<"android" | "ios">("android");
  const [appearance, setAppearance] = useState<"light" | "dark">("light");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [iconBusy, setIconBusy] = useState(false);
  const { status: urlStatus, message: urlMessage, validate: validateUrl } = useApiUrlValidation();
  const [iconArchive, setIconArchive] = useState<Blob>();
  const [builds, setBuilds] = useState<StudioBuild[]>(() => readDemoBuilds(project.id));
  const [activeBuild, setActiveBuild] = useState<StudioBuild>();
  const [buildLog, setBuildLog] = useState<string[]>([]);

  useEffect(() => {
    if (DEMO_MODE) return;
    fetch(`/api/projects/${project.id}/builds`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((history) => {
      if (history?.builds) setBuilds(history.builds);
    }).catch(() => undefined);
  }, [project.id]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const anyBuildRunning = isBuildRunning(activeBuild);

  const set = <K extends keyof StudioProject>(field: K, value: StudioProject[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setSaved(false);
    if (field === "apiBaseUrl" && typeof value === "string") validateUrl(value);
  };

  const applyPersistedChanges = (changes: Partial<StudioProject>, configurationRevision: number) => {
    const updatedAt = new Date().toISOString();
    const nextBaseline = { ...baseline, ...changes, configurationRevision, status: "DRAFT" as const, updatedAt };
    setBaseline(nextBaseline);
    setDraft((current) => ({ ...current, ...changes, configurationRevision, status: "DRAFT", updatedAt }));
    syncProject(nextBaseline);
  };

  const save = async (): Promise<StudioProject | undefined> => {
    if (!dirty) return baseline;
    const result = projectSchema.safeParse(draft);
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      setTab("identity");
      return undefined;
    }
    setSaving(true);
    try {
      const updated = await updateProject(project.id, result.data);
      setBaseline(updated);
      setDraft(updated);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
      return updated;
    } finally { setSaving(false); }
  };

  const acceptZip = async (file: File) => {
    if (file.size > 20_000_000) return;
    setIconBusy(true);
    try {
      const result = await inspectIconKitchenZip(file);
      setIconArchive(file);
      if (DEMO_MODE) {
        set("iconArchiveName", file.name); set("iconManifest", result.manifest); set("iconPreviewUrl", result.previewUrl);
      } else {
        const form = new FormData(); form.set("kind", "ICON_KITCHEN_ARCHIVE"); form.set("file", file);
        const response = await fetch(`/api/projects/${project.id}/assets`, { method: "POST", body: form });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Icon upload failed");
        applyPersistedChanges({ iconArchiveName: payload.asset.name, iconManifest: payload.manifest, iconPreviewUrl: payload.previewUrl }, payload.configurationRevision);
      }
    } finally { setIconBusy(false); }
  };

  const acceptFolder = async (files: FileList) => {
    setIconBusy(true);
    try {
      const list = Array.from(files);
      const paths = list.map((file) => file.webkitRelativePath || file.name);
      const manifest = inspectIconKitchenPaths(paths);
      const previewFile = list.find((file) => (file.webkitRelativePath || file.name).toLowerCase().endsWith("appicon~ios-marketing.png")) ?? list.find((file) => file.name === "play_store_512.png");
      const previewUrl = previewFile ? await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(previewFile); }) : undefined;
      const zip = new JSZip();
      for (const file of list) zip.file(file.webkitRelativePath || file.name, file);
      const archive = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      setIconArchive(archive);
      if (DEMO_MODE) {
        set("iconArchiveName", `${files[0]?.webkitRelativePath.split("/")[0] || "Icon Kitchen"} folder`); set("iconManifest", manifest); set("iconPreviewUrl", previewUrl);
      } else {
        const file = new File([archive], "icon-kitchen.zip", { type: "application/zip" });
        const form = new FormData(); form.set("kind", "ICON_KITCHEN_ARCHIVE"); form.set("file", file);
        const response = await fetch(`/api/projects/${project.id}/assets`, { method: "POST", body: form });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Icon upload failed");
        applyPersistedChanges({ iconArchiveName: payload.asset.name, iconManifest: payload.manifest, iconPreviewUrl: payload.previewUrl }, payload.configurationRevision);
      }
    } finally { setIconBusy(false); }
  };

  const updateLogo = async (kind: "LOGO_LIGHT" | "LOGO_DARK", dataUrl?: string, file?: File) => {
    const field = kind === "LOGO_LIGHT" ? "logoLightUrl" : "logoDarkUrl";
    if (!dataUrl || !file || DEMO_MODE) { set(field, dataUrl); return; }
    const form = new FormData(); form.set("kind", kind); form.set("file", file);
    const response = await fetch(`/api/projects/${project.id}/assets`, { method: "POST", body: form });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Logo upload failed");
    applyPersistedChanges({ [field]: payload.asset.url }, payload.configurationRevision);
  };


  const downloadSource = async (sourceProject: StudioProject) => {
    const form = new FormData(); form.set("project", JSON.stringify(sourceProject));
    if (iconArchive) form.set("icons", iconArchive, "icon-kitchen.zip");
    const response = await fetch(`/api/projects/${project.id}/source`, { method: "POST", body: form });
    if (!response.ok) throw new Error("Source generation failed");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${sourceProject.slug}-flutter-source.zip`; document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  };

  const downloadBuild = async (build: StudioBuild) => {
    if (DEMO_MODE) {
      if (build.type === "SOURCE_ZIP") { await downloadSource(baseline); return; }
      const content = `Open VTS App Studio demo artifact\nResource: ${buildLabels[build.type]}\nProject: ${baseline.name}\nConfiguration revision: ${build.projectRevision}\n`;
      const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${baseline.slug}-${build.type.toLowerCase()}.demo.txt`; document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      return;
    }
    const anchor = document.createElement("a"); anchor.href = `/api/builds/${build.id}/artifact`; document.body.append(anchor); anchor.click(); anchor.remove();
  };

  const upsertBuild = (build: StudioBuild) => {
    setBuilds((current) => {
      const next = [build, ...current.filter((item) => item.id !== build.id)];
      if (DEMO_MODE) localStorage.setItem(demoBuildKey(project.id), JSON.stringify(next.slice(0, 50)));
      return next;
    });
  };

  const runBuild = async (type: BuildType) => {
    if (anyBuildRunning) return;
    const savedProject = dirty ? await save() : baseline;
    if (!savedProject) return;
    const initialBuild: StudioBuild = { id: crypto.randomUUID(), projectId: project.id, projectRevision: savedProject.configurationRevision, type, status: "QUEUED", progress: 0, currentStage: "Preparing build request", etaSeconds: type === "SOURCE_ZIP" ? 30 : 258, createdAt: new Date().toISOString() };
    setActiveBuild(initialBuild);
    setBuildLog([`${buildLabels[type]} requested for revision ${savedProject.configurationRevision}`]);

    if (!DEMO_MODE) {
      const response = await fetch(`/api/projects/${project.id}/builds`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) });
      const payload = await response.json();
      if (!response.ok) { setActiveBuild({ ...initialBuild, status: "FAILED", currentStage: payload.error || "Build request failed" }); return; }
      setActiveBuild(payload.build); upsertBuild(payload.build);

      let done = false;
      const connect = () => {
        if (done) return;
        const events = new EventSource(`/api/builds/${payload.build.id}/events`);
        events.addEventListener("build", (event) => {
          const next = JSON.parse((event as MessageEvent).data) as StudioBuild;
          setActiveBuild(next); upsertBuild(next);
          setBuildLog((current) => current[current.length - 1] === next.currentStage ? current : [...current, next.currentStage]);
          if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(next.status)) { done = true; events.close(); }
        });
        events.onerror = () => { events.close(); if (!done) setTimeout(connect, 3000); };
      };
      connect();
      return;
    }

    let currentBuild = initialBuild;
    for (const step of buildSteps) {
      await wait(step.delay);
      currentBuild = { ...currentBuild, status: step.status, progress: step.progress, currentStage: step.label, etaSeconds: Math.max(3, 32 - step.progress / 4) };
      setActiveBuild(currentBuild); setBuildLog((current) => [...current, step.label]);
    }
    await wait(400);
    const extension = type === "RELEASE_AAB" ? "aab" : type === "SOURCE_ZIP" ? "zip" : "apk";
    const complete: StudioBuild = { ...currentBuild, status: "SUCCEEDED", progress: 100, currentStage: `${buildLabels[type]} is ready to download`, etaSeconds: 0, finishedAt: new Date().toISOString(), artifactName: `${savedProject.slug}-${type.toLowerCase()}.${extension}` };
    setActiveBuild(complete); upsertBuild(complete); setBuildLog((current) => [...current, "Artifact verified", "Download ready"]);
  };

  return (
    <div className="enter-up mx-auto max-w-[1200px]">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div><Link href="/dashboard" className="mb-2 inline-flex items-center gap-1.5 text-[9px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-3" />Applications</Link><div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)]">{draft.iconPreviewUrl ? <img src={draft.iconPreviewUrl} alt="" className="size-full object-cover" /> : <Smartphone className="size-3.5" />}</span><div><div className="flex items-center gap-2"><h1 className="text-[17px] font-bold tracking-[-.03em]">{draft.name}</h1><Badge tone={dirty ? "warning" : "neutral"}>{dirty ? "Unsaved" : `Rev ${baseline.configurationRevision}`}</Badge></div><p className="mt-0.5 text-[9px] text-[var(--muted)]">Android and iOS application studio</p></div></div></div>
        <Button size="md" variant={dirty ? "primary" : "secondary"} loading={saving} onClick={() => void save()}>{saved || !dirty ? <Check className="size-3.5" /> : <Save className="size-3.5" />}{saved ? "Saved" : dirty ? "Save" : "Saved"}</Button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(400px,0.86fr)_minmax(440px,1.14fr)]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
          <div className="grid grid-cols-3 border-b border-[var(--line)] bg-[var(--surface-elevated)] p-1">{([{ id: "identity", label: "Identity", icon: Code2 }, { id: "branding", label: "Branding", icon: ImageIcon }, { id: "build", label: "Build & release", icon: PackageCheck }] as const).map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={cn("flex h-8 items-center justify-center gap-1.5 rounded-md text-[9px] font-bold transition", tab === item.id ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--foreground)]")}><item.icon className="size-3" /><span>{item.label}</span></button>)}</div>

          {tab === "identity" ? <div className="p-4"><SectionTitle title="Application identity" copy="Set the names and identifiers for each platform." /><div className="mt-4 grid gap-3"><PlatformPanel icon={<Smartphone className="size-3.5" />} title="Android"><FieldShell label="Application name" error={errors.androidApplicationName}><Input value={draft.androidApplicationName} onChange={(event) => set("androidApplicationName", event.target.value)} /></FieldShell><FieldShell label="Package name" error={errors.androidPackageName}><Input className="font-mono text-[10px]" value={draft.androidPackageName} onChange={(event) => set("androidPackageName", event.target.value)} /></FieldShell></PlatformPanel><PlatformPanel icon={<Apple className="size-3.5" />} title="iOS"><FieldShell label="Application name" error={errors.iosApplicationName}><Input value={draft.iosApplicationName} onChange={(event) => set("iosApplicationName", event.target.value)} /></FieldShell><FieldShell label="Bundle identifier" error={errors.iosBundleId}><Input className="font-mono text-[10px]" value={draft.iosBundleId} onChange={(event) => set("iosBundleId", event.target.value)} /></FieldShell></PlatformPanel><PlatformPanel icon={<Globe className="size-3.5" />} title="Base API URL"><FieldShell label="API base URL" error={errors.apiBaseUrl}><div className="relative"><Input className="font-mono text-[10px] pr-7" value={draft.apiBaseUrl} onChange={(event) => set("apiBaseUrl", event.target.value)} placeholder="https://app.openvts.io/api" /><span className="absolute right-2 top-1/2 -translate-y-1/2">{urlStatus === "validating" ? <LoaderCircle className="size-3 animate-spin text-[var(--muted)]" /> : urlStatus === "valid" ? <CheckCircle2 className="size-3 text-[var(--success)]" /> : urlStatus === "invalid" ? <XCircle className="size-3 text-[var(--danger)]" /> : null}</span></div></FieldShell>{urlMessage ? <p className={`mt-1 text-[9px] font-medium ${urlStatus === "valid" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{urlMessage}</p> : null}<p className="mt-1 text-[9px] text-[var(--muted)]">Validates by calling <span className="font-mono">{draft.apiBaseUrl}/health</span></p></PlatformPanel><FieldShell label="Description" optional><Textarea value={draft.description || ""} onChange={(event) => set("description", event.target.value)} /></FieldShell></div></div> : null}

          {tab === "branding" ? <div className="p-4"><SectionTitle title="Logos and launcher icons" copy="Upload the assets your application should use." /><div className="mt-4 grid gap-3 sm:grid-cols-2"><LogoUpload label="Light logo" description="For light application surfaces" value={draft.logoLightUrl} onChange={(value, file) => void updateLogo("LOGO_LIGHT", value, file)} /><LogoUpload label="Dark logo" description="For dark application surfaces" value={draft.logoDarkUrl} onChange={(value, file) => void updateLogo("LOGO_DARK", value, file)} /></div><div className="mt-3 flex items-center justify-between rounded-lg border border-[var(--line)] p-3"><div><p className="text-[10px] font-bold">Accent color</p><p className="mt-0.5 text-[9px] text-[var(--muted)]">Used for active controls and routes.</p></div><div className="flex items-center gap-2"><input aria-label="Accent color" type="color" value={draft.accentColor} onChange={(event) => set("accentColor", event.target.value)} className="size-7 cursor-pointer rounded-md border-0 bg-transparent p-0" /><Input className="w-20 font-mono text-[9px] uppercase" value={draft.accentColor} onChange={(event) => set("accentColor", event.target.value)} /></div></div><div className="mt-4"><p className="mb-2 text-[10px] font-bold">App launcher icons</p><IconArchiveUpload valid={draft.iconManifest?.valid} name={draft.iconArchiveName} details={draft.iconManifest ? `${draft.iconManifest.fileCount} files · Android ${draft.iconManifest.platforms.android ? "ready" : "missing"} · iOS ${draft.iconManifest.platforms.ios ? "ready" : "missing"}` : undefined} previewUrl={draft.iconPreviewUrl} busy={iconBusy} onZip={(file) => void acceptZip(file)} onFolder={(files) => void acceptFolder(files)} onRemove={() => { setIconArchive(undefined); set("iconArchiveName", undefined); set("iconManifest", undefined); set("iconPreviewUrl", undefined); }} /></div>{draft.iconManifest ? <div className="mt-2 grid gap-1.5">{draft.iconManifest.missing.map((item) => <p key={item} className="flex items-start gap-1.5 text-[9px] text-[var(--danger)]"><AlertCircle className="mt-0.5 size-3 shrink-0" />Missing {item}</p>)}{draft.iconManifest.valid ? <p className="flex items-center gap-1.5 text-[9px] font-semibold text-[var(--success)]"><CheckCircle2 className="size-3" />Android and iOS icons are ready.</p> : null}</div> : null}</div> : null}

          {tab === "build" ? <div className="p-4"><SectionTitle title="Build and download" copy="Every download always matches your latest saved changes." />{activeBuild ? <BuildProgress build={activeBuild} log={buildLog} onDownload={() => void downloadBuild(activeBuild)} onClose={() => setActiveBuild(undefined)} /> : null}{dirty ? <div className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--warning-soft)] px-2.5 py-2 text-[9px] font-semibold text-[var(--warning)]"><Save className="size-3" />Changes will be saved before building.</div> : null}<div className="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-lg border border-[var(--line)]">{resources.map((resource) => { const current = currentBuildFor(builds, resource.type, baseline.configurationRevision, dirty); const latest = latestSuccessfulBuild(builds, resource.type); const running = activeBuild?.type === resource.type && isBuildRunning(activeBuild); return <div key={resource.type} className="grid gap-2 bg-[var(--surface)] p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center"><span className="grid size-7 place-items-center rounded-md bg-[var(--accent-soft)]"><resource.icon className="size-3" /></span><div><div className="flex flex-wrap items-center gap-1.5"><p className="text-[10px] font-bold">{resource.label}</p>{current ? <Badge tone="success">Up to date</Badge> : latest ? <Badge tone="warning">Rebuild</Badge> : null}</div><p className="mt-0.5 text-[9px] text-[var(--muted)]">{running ? activeBuild?.currentStage : current ? `Rev ${current.projectRevision}` : latest ? "Changed since last build" : resource.copy}</p></div><Button type="button" size="sm" variant={current ? "secondary" : "primary"} disabled={Boolean(anyBuildRunning && !running)} loading={running} onClick={() => current ? void downloadBuild(current) : void runBuild(resource.type)}>{current ? <Download className="size-3" /> : <Hammer className="size-3" />}{running ? "Building" : current ? "Download" : "Build"}</Button></div>; })}</div></div> : null}
        </section>

        <AppPreview project={draft} platform={platform} appearance={appearance} onPlatformChange={setPlatform} onAppearanceChange={setAppearance} />
      </div>
    </div>
  );
}

function SectionTitle({ title, copy }: { title: string; copy: string }) { return <div><h2 className="text-[14px] font-bold tracking-[-.03em]">{title}</h2><p className="mt-1 text-[9px] text-[var(--muted)]">{copy}</p></div>; }
function PlatformPanel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) { return <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-elevated)] p-3"><div className="mb-3 flex items-center gap-2"><span className="grid size-6 place-items-center rounded-md bg-[var(--surface)] shadow-sm">{icon}</span><p className="text-[10px] font-bold">{title}</p></div><div className="grid gap-3">{children}</div></div>; }

function BuildProgress({ build, log, onDownload, onClose }: { build: StudioBuild; log: string[]; onDownload: () => void; onClose: () => void }) {
  const done = ["SUCCEEDED", "FAILED", "CANCELLED"].includes(build.status);
  const running = !done;
  const logRef = useRef<HTMLDivElement>(null);
  const [liveLog, setLiveLog] = useState("");
  const [showLog, setShowLog] = useState(true);

  useEffect(() => {
    if (DEMO_MODE || done) return;
    const events = new EventSource(`/api/builds/${build.id}/log`);
    events.addEventListener("message", (event) => {
      setLiveLog((current) => current + JSON.parse(event.data));
    });
    events.addEventListener("done", () => events.close());
    events.onerror = () => events.close();
    return () => events.close();
  }, [build.id, done]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [liveLog, log]);

  const logLines = DEMO_MODE
    ? log
    : liveLog.split("\n").filter(Boolean).slice(-100);

  const elapsed = build.createdAt
    ? Math.round((Date.now() - new Date(build.createdAt).getTime()) / 1000)
    : 0;

  return (
    <section className="mt-3 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-elevated)] shadow-[var(--shadow-card)]">
      <div className="grid gap-2.5 p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <span className={cn("grid size-8 place-items-center rounded-md", build.status === "SUCCEEDED" ? "bg-[var(--success-soft)] text-[var(--success)]" : build.status === "FAILED" ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--accent-soft)]")}>
          {build.status === "SUCCEEDED" ? <Check className="size-3.5" /> : build.status === "FAILED" ? <AlertCircle className="size-3.5" /> : <LoaderCircle className="size-3.5 animate-spin" />}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold">{buildLabels[build.type]}</p>
            <Badge tone={build.status === "SUCCEEDED" ? "success" : build.status === "FAILED" ? "danger" : "neutral"}>{build.status === "SUCCEEDED" ? "Ready" : build.status === "FAILED" ? "Failed" : "Building"}</Badge>
            {running ? <span className="text-[8px] text-[var(--muted)]">{elapsed}s</span> : null}
          </div>
          <p className="mt-1 text-[9px] text-[var(--muted)]">{build.currentStage}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--accent-soft)]">
            <div className={cn("h-full rounded-full transition-all duration-700 ease-out", build.status === "FAILED" ? "bg-[var(--danger)]" : build.status === "SUCCEEDED" ? "bg-[var(--success)]" : "bg-[var(--foreground)]")} style={{ width: `${build.progress}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[8px] font-semibold text-[var(--muted)]">{build.progress}%</span>
            {running && build.etaSeconds ? <span className="flex items-center gap-1 text-[8px] text-[var(--muted)]"><Clock3 className="size-2.5" />~{Math.ceil(build.etaSeconds)}s</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {build.status === "SUCCEEDED" ? <Button size="sm" onClick={onDownload}><Download className="size-3" />Download</Button> : done ? <Button size="sm" variant="secondary" onClick={onClose}>Close</Button> : null}
        </div>
      </div>

      <div className="border-t border-[var(--line)]">
        <button type="button" onClick={() => setShowLog(!showLog)} className="flex w-full items-center justify-between px-3 py-2 text-[8px] font-bold text-[var(--muted)] hover:text-[var(--foreground)]">
          <span>Build output · {logLines.length} lines</span>
          <span>{showLog ? "▾" : "▸"}</span>
        </button>
        {showLog ? (
          <div ref={logRef} className="max-h-40 overflow-auto border-t border-[var(--line)] bg-[#0d0d0d] px-3 py-2 font-mono text-[9px] leading-[16px] text-[#a8b1ba]">
            {logLines.length === 0 && running ? (
              <p className="animate-pulse text-[#586573]">Waiting for build output...</p>
            ) : (
              logLines.map((line, index) => (
                <p key={index} className={cn(line.includes("ERROR") || line.includes("FAILED") ? "text-[#f87171]" : line.includes("✓") || line.includes("completed") ? "text-[#4ade80]" : line.startsWith("$") ? "text-[#93c5fd]" : "")}>
                  {line}
                </p>
              ))
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
