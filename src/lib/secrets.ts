import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

function encryptionKey() {
  if (!/^[0-9a-fA-F]{64}$/.test(env.SIGNING_ENCRYPTION_KEY)) throw new Error("SIGNING_ENCRYPTION_KEY must contain 64 hexadecimal characters");
  return Buffer.from(env.SIGNING_ENCRYPTION_KEY, "hex");
}

function decodeComponent(value: string, expectedLength?: number) {
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value || (expectedLength !== undefined && decoded.length !== expectedLength)) {
    throw new Error("Invalid encrypted secret payload");
  }
  return decoded;
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string) {
  const [version, ivValue, tagValue, encryptedValue] = payload.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) throw new Error("Invalid encrypted secret payload");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), decodeComponent(ivValue, 12));
  decipher.setAuthTag(decodeComponent(tagValue, 16));
  return Buffer.concat([decipher.update(decodeComponent(encryptedValue)), decipher.final()]).toString("utf8");
}
