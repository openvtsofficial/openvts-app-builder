import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secrets";
import { storage } from "@/lib/storage";

export async function signingKeyForProject(projectId?: string) {
  const profile = projectId ? await prisma.signingProfile.findUnique({ where: { projectId }, include: { keystoreAsset: true } }) : null;
  if (profile) return {
    bytes: await storage.get(profile.keystoreAsset.storageKey),
    alias: profile.keyAlias,
    storePassword: decryptSecret(profile.encryptedStorePassword),
    keyPassword: decryptSecret(profile.encryptedKeyPassword),
  };
  return {
    bytes: await readFile(path.resolve(/* turbopackIgnore: true */ env.SIGNING_KEYSTORE_PATH)),
    alias: env.SIGNING_KEY_ALIAS,
    storePassword: env.SIGNING_STORE_PASSWORD,
    keyPassword: env.SIGNING_KEY_PASSWORD ?? env.SIGNING_STORE_PASSWORD,
  };
}

export function propertyEscape(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll("\r", "\\r").replaceAll("\t", "\\t").replaceAll(" ", "\\ ").replaceAll(":", "\\:").replaceAll("=", "\\=");
}

export async function configureAndroidSigning(workspace: string, projectId: string) {
  const key = await signingKeyForProject(projectId);
  if (!key.alias || !key.storePassword || !key.keyPassword) throw new Error("Release signing credentials are not configured");
  await writeFile(path.join(/* turbopackIgnore: true */ workspace, "android", "app", "release-key.jks"), key.bytes, { mode: 0o600 });
  const properties = [
    `storePassword=${propertyEscape(key.storePassword)}`,
    `keyPassword=${propertyEscape(key.keyPassword)}`,
    `keyAlias=${propertyEscape(key.alias)}`,
    "storeFile=release-key.jks",
  ].join("\n");
  await writeFile(path.join(/* turbopackIgnore: true */ workspace, "android", "key.properties"), `${properties}\n`, { mode: 0o600 });
}
