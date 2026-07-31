import { createHash } from "node:crypto";
import { ApiError, errorResponse, requireOwnedProject, requireUserId } from "@/lib/api";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/secrets";
import { createStorageKey, storage } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUserId();
    const { id } = await params;
    await requireOwnedProject(id, ownerId);
    const profile = await prisma.signingProfile.findUnique({ where: { projectId: id } });
    return Response.json({ profile: profile ? { id: profile.id, name: profile.name, keyAlias: profile.keyAlias, connected: true, updatedAt: profile.updatedAt.toISOString() } : null });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let storedKey: string | undefined;
  try {
    const ownerId = await requireUserId();
    const { id } = await params;
    await requireOwnedProject(id, ownerId);
    const form = await request.formData();
    const file = form.get("keystore");
    const keyAlias = String(form.get("keyAlias") || "").trim();
    const storePassword = String(form.get("storePassword") || "");
    const keyPassword = String(form.get("keyPassword") || storePassword);
    if (!(file instanceof File)) throw new ApiError(400, "Keystore file is required");
    if (!/\.(jks|keystore)$/i.test(file.name) || file.size > 5_000_000) throw new ApiError(422, "Use a .jks or .keystore file smaller than 5 MB");
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(keyAlias)) throw new ApiError(422, "Key alias is invalid");
    if (storePassword.length < 6 || keyPassword.length < 6) throw new ApiError(422, "Signing passwords must contain at least 6 characters");
    const data = Buffer.from(await file.arrayBuffer());
    storedKey = createStorageKey(ownerId, id, "signing", ".jks");
    await storage.put(storedKey, data, "application/octet-stream");
    const result = await prisma.$transaction(async (tx) => {
      const previous = await tx.signingProfile.findUnique({ where: { projectId: id }, include: { keystoreAsset: true } });
      const asset = await tx.asset.create({ data: { projectId: id, kind: "SIGNING_KEYSTORE", originalName: file.name, storageKey: storedKey!, mimeType: "application/octet-stream", sizeBytes: data.length, checksum: createHash("sha256").update(data).digest("hex") } });
      const profile = await tx.signingProfile.upsert({
        where: { projectId: id },
        create: { projectId: id, name: file.name, keystoreAssetId: asset.id, keyAlias, encryptedStorePassword: encryptSecret(storePassword), encryptedKeyPassword: encryptSecret(keyPassword) },
        update: { name: file.name, keystoreAssetId: asset.id, keyAlias, encryptedStorePassword: encryptSecret(storePassword), encryptedKeyPassword: encryptSecret(keyPassword) },
      });
      if (previous) await tx.asset.delete({ where: { id: previous.keystoreAssetId } });
      const project = await tx.project.update({ where: { id }, data: { configurationRevision: { increment: 1 }, status: "DRAFT" }, select: { configurationRevision: true } });
      await tx.auditLog.create({ data: { actorId: ownerId, projectId: id, action: "signing-profile.updated", entityType: "SigningProfile", entityId: profile.id } });
      return { profile, previous, project };
    });
    if (result.previous) await storage.remove(result.previous.keystoreAsset.storageKey).catch(() => undefined);
    return Response.json({ profile: { id: result.profile.id, name: result.profile.name, keyAlias: result.profile.keyAlias, connected: true }, configurationRevision: result.project.configurationRevision }, { status: 201 });
  } catch (error) {
    if (storedKey) await storage.remove(storedKey).catch(() => undefined);
    return errorResponse(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUserId();
    const { id } = await params;
    await requireOwnedProject(id, ownerId);
    const profile = await prisma.signingProfile.findUnique({ where: { projectId: id }, include: { keystoreAsset: true } });
    if (!profile) return new Response(null, { status: 204 });
    await prisma.$transaction(async (tx) => {
      await tx.signingProfile.delete({ where: { id: profile.id } });
      await tx.asset.delete({ where: { id: profile.keystoreAssetId } });
      await tx.project.update({ where: { id }, data: { configurationRevision: { increment: 1 }, status: "DRAFT" } });
      await tx.auditLog.create({ data: { actorId: ownerId, projectId: id, action: "signing-profile.deleted", entityType: "SigningProfile", entityId: profile.id } });
    });
    await storage.remove(profile.keystoreAsset.storageKey).catch(() => undefined);
    return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}
