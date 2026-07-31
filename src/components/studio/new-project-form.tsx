"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Globe, LoaderCircle, Smartphone, XCircle } from "lucide-react";
import { useStudio } from "@/components/studio-provider";
import { Button } from "@/components/ui/button";
import { FieldShell, Input, Textarea } from "@/components/ui/field";
import { projectSchema } from "@/lib/validation";

const initial = {
  name: "",
  description: "",
  androidApplicationName: "",
  iosApplicationName: "",
  androidPackageName: "com.company.app",
  iosBundleId: "com.company.app",
  apiBaseUrl: "https://app.openvts.io/api",
  accentColor: "#171716",
};

type UrlStatus = "idle" | "validating" | "valid" | "invalid";

function useApiUrlValidation() {
  const [status, setStatus] = useState<UrlStatus>("idle");
  const [message, setMessage] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const validate = useCallback((url: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!url || url.length < 10) { setStatus("idle"); setMessage(""); return; }
    setStatus("validating");
    setMessage("");
    timerRef.current = setTimeout(async () => {
      try {
        const response = await fetch("/api/validate-api-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
        const result = await response.json();
        if (result.valid) { setStatus("valid"); setMessage("API is reachable"); }
        else { setStatus("invalid"); setMessage(result.error || "Unreachable"); }
      } catch { setStatus("invalid"); setMessage("Validation request failed"); }
    }, 800);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return { status, message, validate };
}

export function NewProjectForm() {
  const router = useRouter();
  const { createProject } = useStudio();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const { status: urlStatus, message: urlMessage, validate: validateUrl } = useApiUrlValidation();

  const set = (field: keyof typeof form, value: string) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "name") {
        if (!current.androidApplicationName || current.androidApplicationName === current.name) next.androidApplicationName = value;
        if (!current.iosApplicationName || current.iosApplicationName === current.name) next.iosApplicationName = value;
      }
      if (field === "apiBaseUrl") validateUrl(value);
      return next;
    });
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = projectSchema.safeParse(form);
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return;
    }
    setSubmitting(true);
    try {
      const project = await createProject(result.data);
      router.push(`/projects/${project.id}`);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="enter-up mx-auto max-w-[680px]">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-3" />Applications</Link>
      <div className="mt-4 border-b border-[var(--line)] pb-4"><h1 className="text-[22px] font-semibold tracking-[-.04em]">Create application</h1><p className="mt-1 text-[10px] text-[var(--muted)]">Enter the names and identifiers users will see on Android and iOS.</p></div>
      <form onSubmit={submit} className="mt-4 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
        <div className="grid gap-3 border-b border-[var(--line)] p-4">
          <FieldShell label="Project name" error={errors.name}><Input autoFocus value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Northstar Fleet" /></FieldShell>
          <FieldShell label="Description" error={errors.description} optional><Textarea value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Optional internal note" /></FieldShell>
        </div>
        <div className="border-b border-[var(--line)] p-4"><div className="mb-3 flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md bg-[var(--accent-soft)]"><Globe className="size-3.5" /></span><h2 className="text-[11px] font-bold">Base API URL</h2></div><FieldShell label="API base URL" error={errors.apiBaseUrl}><div className="relative"><Input className="font-mono text-[10px] pr-7" value={form.apiBaseUrl} onChange={(event) => set("apiBaseUrl", event.target.value)} placeholder="https://app.openvts.io/api" /><span className="absolute right-2 top-1/2 -translate-y-1/2">{urlStatus === "validating" ? <LoaderCircle className="size-3 animate-spin text-[var(--muted)]" /> : urlStatus === "valid" ? <CheckCircle2 className="size-3 text-[var(--success)]" /> : urlStatus === "invalid" ? <XCircle className="size-3 text-[var(--danger)]" /> : null}</span></div></FieldShell>{urlMessage ? <p className={`mt-1 text-[9px] font-medium ${urlStatus === "valid" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{urlMessage}</p> : null}<p className="mt-1 text-[9px] text-[var(--muted)]">Connects to <span className="font-mono">{form.apiBaseUrl}/health</span> to verify.</p></div>
        <div className="p-4"><div className="mb-3 flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md bg-[var(--accent-soft)]"><Smartphone className="size-3.5" /></span><h2 className="text-[11px] font-bold">Application identity</h2></div><div className="grid gap-3 sm:grid-cols-2"><FieldShell label="Android application name" error={errors.androidApplicationName}><Input value={form.androidApplicationName} onChange={(event) => set("androidApplicationName", event.target.value)} /></FieldShell><FieldShell label="Android package name" error={errors.androidPackageName}><Input className="font-mono text-[10px]" value={form.androidPackageName} onChange={(event) => set("androidPackageName", event.target.value)} /></FieldShell><FieldShell label="iOS application name" error={errors.iosApplicationName}><Input value={form.iosApplicationName} onChange={(event) => set("iosApplicationName", event.target.value)} /></FieldShell><FieldShell label="iOS bundle identifier" error={errors.iosBundleId}><Input className="font-mono text-[10px]" value={form.iosBundleId} onChange={(event) => set("iosBundleId", event.target.value)} /></FieldShell></div></div>
        <div className="flex justify-end border-t border-[var(--line)] bg-[var(--surface-elevated)] p-3 sm:px-4"><Button size="md" loading={submitting} type="submit">Create application <ArrowRight className="size-3.5" /></Button></div>
      </form>
    </div>
  );
}
