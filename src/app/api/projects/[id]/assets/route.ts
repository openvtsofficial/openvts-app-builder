import { createHash } from "node:crypto";
import JSZip from "jszip";
import sharp from "sharp";
import type { Prisma } from "@/generated/prisma/client";
import { requireOwnedProject, requireUserId, errorResponse, ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { canonicalIconPath, inspectIconKitchenZip } from "@/lib/icon-kitchen";
import { createStorageKey, storage } from "@/lib/storage";

const logoKinds = { LOGO_LIGHT: "logo-light", LOGO_DARK: "logo-dark" } as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const storedKeys: string[] = [];
  try {
    const ownerId = await requireUserId();
    const { id } = await params;
    await requireOwnedProject(id, ownerId);
    const form = await request.formData();
    const kind = String(form.get("kind"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Asset file is required");

    if (kind in logoKinds) {
      if (file.size > 2_000_000) throw new ApiError(413, "Logo must be smaller than 2 MB");
      const output = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16_777_216 }).resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
      const assetKind = kind as keyof typeof logoKinds;
      const key = createStorageKey(ownerId, id, logoKinds[assetKind], ".png");
      await storage.put(key, output, "image/png"); storedKeys.push(key);
      const checksum = createHash("sha256").update(output).digest("hex");
      const result = await prisma.$transaction(async (tx) => {
        const previous = await tx.asset.findMany({ where: { projectId: id, kind: assetKind } });
        const asset = await tx.asset.create({ data: { projectId: id, kind: assetKind, originalName: file.name, storageKey: key, mimeType: "image/png", sizeBytes: output.length, checksum } });
        const project = await tx.project.update({ where: { id }, data: { ...(assetKind === "LOGO_LIGHT" ? { logoLightKey: key } : { logoDarkKey: key }), configurationRevision: { increment: 1 }, status: "DRAFT" }, select: { configurationRevision: true } });
        if (previous.length) await tx.asset.deleteMany({ where: { id: { in: previous.map((item) => item.id) } } });
        return { asset, previous, project };
      });
      await Promise.allSettled(result.previous.map((item) => storage.remove(item.storageKey)));
      return Response.json({ asset: { id: result.asset.id, url: `/api/assets/${result.asset.id}` }, configurationRevision: result.project.configurationRevision }, { status: 201 });
    }

    if (kind === "ICON_KITCHEN_ARCHIVE") {
      if (file.size > 20_000_000) throw new ApiError(413, "Icon archive must be smaller than 20 MB");
      const buffer = Buffer.from(await file.arrayBuffer());
      const { manifest } = await inspectIconKitchenZip(buffer);
      if (!manifest.valid) throw new ApiError(422, `Icon Kitchen archive is incomplete: ${manifest.missing.join(", ")}`);
      const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
      const originalPath = Object.keys(zip.files).find((candidate) => canonicalIconPath(candidate) === manifest.sampleIconPath);
      if (!originalPath) throw new ApiError(422, "Icon preview could not be extracted");
      const preview = await sharp(await zip.file(originalPath)!.async("nodebuffer")).resize(512, 512, { fit: "cover" }).png().toBuffer();
      const archiveKey = createStorageKey(ownerId, id, "icon-kitchen", ".zip");
      const previewKey = createStorageKey(ownerId, id, "icon-preview", ".png");
      await storage.put(archiveKey, buffer, "application/zip"); storedKeys.push(archiveKey);
      await storage.put(previewKey, preview, "image/png"); storedKeys.push(previewKey);
      const result = await prisma.$transaction(async (tx) => {
        const previous = await tx.asset.findMany({ where: { projectId: id, kind: { in: ["ICON_KITCHEN_ARCHIVE", "ICON_PREVIEW"] } } });
        const archive = await tx.asset.create({ data: { projectId: id, kind: "ICON_KITCHEN_ARCHIVE", originalName: file.name, storageKey: archiveKey, mimeType: "application/zip", sizeBytes: buffer.length, checksum: createHash("sha256").update(buffer).digest("hex"), metadata: manifest as unknown as Prisma.InputJsonValue } });
        const previewAsset = await tx.asset.create({ data: { projectId: id, kind: "ICON_PREVIEW", originalName: "icon-preview.png", storageKey: previewKey, mimeType: "image/png", sizeBytes: preview.length, checksum: createHash("sha256").update(preview).digest("hex") } });
        const project = await tx.project.update({ where: { id }, data: { iconArchiveKey: archiveKey, iconPreviewKey: previewKey, iconManifest: manifest as unknown as Prisma.InputJsonValue, configurationRevision: { increment: 1 }, status: "DRAFT" }, select: { configurationRevision: true } });
        if (previous.length) await tx.asset.deleteMany({ where: { id: { in: previous.map((item) => item.id) } } });
        return { archive, previewAsset, previous, project };
      });
      await Promise.allSettled(result.previous.map((item) => storage.remove(item.storageKey)));
      return Response.json({ asset: { id: result.archive.id, name: file.name }, previewUrl: `/api/assets/${result.previewAsset.id}`, manifest, configurationRevision: result.project.configurationRevision }, { status: 201 });
    }
    throw new ApiError(400, "Unsupported asset kind");
  } catch (error) {
    await Promise.allSettled(storedKeys.map((key) => storage.remove(key)));
    return errorResponse(error);
  }
}
