import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

function safeKey(key: string) {
  const normalized = key.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) throw new Error("Unsafe storage key");
  return normalized;
}

function s3() {
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    credentials: env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } : undefined,
  });
}

function localPath(key: string) {
  return path.resolve(env.LOCAL_STORAGE_ROOT, "uploads", safeKey(key));
}

export function createStorageKey(ownerId: string, projectId: string, category: string, extension: string) {
  const safeExtension = extension.toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
  return `${ownerId}/${projectId}/${category}/${randomUUID()}${safeExtension.startsWith(".") ? safeExtension : `.${safeExtension}`}`;
}

export const storage = {
  async put(key: string, body: Buffer, contentType: string) {
    key = safeKey(key);
    if (env.STORAGE_DRIVER === "s3") {
      await s3().send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256" }));
    } else {
      const destination = localPath(key);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, body, { mode: 0o600 });
    }
    return key;
  },
  async get(key: string) {
    key = safeKey(key);
    if (env.STORAGE_DRIVER === "s3") {
      const response = await s3().send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      if (!response.Body) throw new Error("Stored object is empty");
      return Buffer.from(await response.Body.transformToByteArray());
    }
    return readFile(localPath(key));
  },
  async remove(key: string) {
    key = safeKey(key);
    if (env.STORAGE_DRIVER === "s3") await s3().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    else await rm(localPath(key), { force: true });
  },
  async signedDownloadUrl(key: string, expiresIn = 300) {
    if (env.STORAGE_DRIVER !== "s3") return undefined;
    return getSignedUrl(s3(), new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: safeKey(key) }), { expiresIn });
  },
};
