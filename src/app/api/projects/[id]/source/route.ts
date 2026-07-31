import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireOwnedProject, requireUserId, errorResponse } from "@/lib/api";
import { env, isDemoMode } from "@/lib/env";
import { materializeFlutterProject, zipDirectory } from "@/lib/flutter-template";
import type { StudioProject } from "@/lib/types";
import { projectSchema, slugify } from "@/lib/validation";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let temporary: string | undefined;
  try {
    const { id } = await params;
    let persisted: Awaited<ReturnType<typeof requireOwnedProject>> | undefined;
    if (!isDemoMode) {
      const ownerId = await requireUserId();
      persisted = await requireOwnedProject(id, ownerId);
    }
    const form = await request.formData();
    const raw = JSON.parse(String(form.get("project"))) as StudioProject;
    const input = projectSchema.parse(raw);
    const project: StudioProject = {
      ...raw,
      ...input,
      id,
      slug: raw.slug || slugify(input.name),
      status: raw.status || "DRAFT",
      templateVersion: raw.templateVersion || "1.0.0",
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (persisted?.logoLightKey) project.logoLightUrl = `data:image/png;base64,${(await storage.get(persisted.logoLightKey)).toString("base64")}`;
    if (persisted?.logoDarkKey) project.logoDarkUrl = `data:image/png;base64,${(await storage.get(persisted.logoDarkKey)).toString("base64")}`;
    const icons = form.get("icons");
    const iconBuffer = icons instanceof File ? Buffer.from(await icons.arrayBuffer()) : persisted?.iconArchiveKey ? await storage.get(persisted.iconArchiveKey) : undefined;
    temporary = await mkdtemp(path.join(os.tmpdir(), "openvts-source-"));
    const outputRoot = path.join(temporary, project.slug);
    await materializeFlutterProject({ project, templateRoot: path.resolve(env.FLUTTER_TEMPLATE_ROOT), outputRoot, iconArchive: iconBuffer });
    const archive = await zipDirectory(outputRoot);
    return new Response(new Uint8Array(archive), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${project.slug}-flutter-source.zip"`, "Content-Length": String(archive.length), "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
  finally { if (temporary) await rm(temporary, { recursive: true, force: true }).catch(() => undefined); }
}
