import JSZip from "jszip";
import type { IconKitchenManifest } from "@/lib/types";

const MAX_FILES = 400;
const requiredGroups = [
  ["android/res/mipmap-mdpi/ic_launcher.png"],
  ["android/res/mipmap-hdpi/ic_launcher.png"],
  ["android/res/mipmap-xhdpi/ic_launcher.png"],
  ["android/res/mipmap-xxhdpi/ic_launcher.png"],
  ["android/res/mipmap-xxxhdpi/ic_launcher.png"],
  ["ios/contents.json"],
  ["ios/appicon~ios-marketing.png"],
];

function cleanPath(path: string) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function findPlatformOffset(parts: string[]) {
  const index = parts.findIndex((part) => ["android", "ios", "web"].includes(part.toLowerCase()));
  return index < 0 ? parts : parts.slice(index);
}

export function canonicalIconPath(path: string) {
  return findPlatformOffset(cleanPath(path).split("/").filter(Boolean)).join("/");
}

export function inspectIconKitchenPaths(inputPaths: string[]): IconKitchenManifest {
  const paths = inputPaths
    .filter((path) => !path.endsWith("/") && !path.includes("__MACOSX"))
    .map(canonicalIconPath)
    .filter((path) => path && !path.includes(".."));
  const lower = new Set(paths.map((path) => path.toLowerCase()));
  const missing = requiredGroups
    .filter((group) => !group.some((candidate) => lower.has(candidate)))
    .map((group) => group[0]);
  const warnings: string[] = [];
  if (!lower.has("android/res/mipmap-anydpi-v26/ic_launcher.xml")) warnings.push("Android adaptive icon metadata was not found; legacy icons will still work.");
  if (!paths.some((path) => path.toLowerCase().includes("monochrome"))) warnings.push("Android monochrome icon was not found.");
  if (paths.length > MAX_FILES) warnings.push(`Archive contains ${paths.length} files; only recognized icon assets will be used.`);
  const sampleIconPath = paths.find((path) => path.toLowerCase() === "ios/appicon~ios-marketing.png")
    ?? paths.find((path) => path.toLowerCase() === "android/play_store_512.png")
    ?? paths.find((path) => path.toLowerCase().endsWith("mipmap-xxxhdpi/ic_launcher.png"));

  return {
    valid: missing.length === 0 && paths.length <= MAX_FILES,
    fileCount: paths.length,
    platforms: {
      android: paths.some((path) => path.toLowerCase().startsWith("android/")),
      ios: paths.some((path) => path.toLowerCase().startsWith("ios/")),
      web: paths.some((path) => path.toLowerCase().startsWith("web/")),
    },
    missing,
    warnings,
    sampleIconPath,
  };
}

export async function inspectIconKitchenZip(data: Blob | ArrayBuffer | Uint8Array) {
  const zip = await JSZip.loadAsync(data, { checkCRC32: true });
  const originalPaths = Object.keys(zip.files).filter((path) => !zip.files[path].dir);
  const manifest = inspectIconKitchenPaths(originalPaths);
  let previewUrl: string | undefined;
  if (manifest.sampleIconPath && typeof window !== "undefined") {
    const match = originalPaths.find((path) => canonicalIconPath(path) === manifest.sampleIconPath);
    if (match) {
      const blob = await zip.file(match)!.async("blob");
      previewUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    }
  }
  return { manifest, zip, previewUrl };
}

export const recognizedIconPrefixes = ["android/res/", "ios/", "web/"] as const;
