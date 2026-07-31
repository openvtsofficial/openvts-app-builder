#!/usr/bin/env node
/**
 * Extracts public/projects/base-code.zip into templates/flutter_base/
 * and creates required data directories. Run once after cloning or
 * whenever base-code.zip is updated.
 */
import { createReadStream, existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

const ROOT = path.resolve(import.meta.dirname, "..");
const ZIP_PATH = path.join(ROOT, "public", "projects", "base-code.zip");
const TEMPLATE_ROOT = path.join(ROOT, "templates", "flutter_base");
const DATA_DIRS = [
  path.join(ROOT, "data"),
  path.join(ROOT, "data", "workspaces"),
  path.join(ROOT, "data", "artifacts"),
  path.join(ROOT, "data", "uploads"),
];

async function readFile(filePath) {
  const { readFile } = await import("node:fs/promises");
  return readFile(filePath);
}

async function main() {
  if (!existsSync(ZIP_PATH)) {
    console.error(`ERROR: base-code.zip not found at ${ZIP_PATH}`);
    process.exit(1);
  }

  // Create data directories
  for (const dir of DATA_DIRS) {
    await mkdir(dir, { recursive: true });
    console.log(`  ✓ ${path.relative(ROOT, dir)}/`);
  }

  // Extract template
  console.log(`\nExtracting base-code.zip → templates/flutter_base/`);
  await rm(TEMPLATE_ROOT, { recursive: true, force: true });
  await mkdir(TEMPLATE_ROOT, { recursive: true });

  const zipBuffer = await readFile(ZIP_PATH);
  const zip = await JSZip.loadAsync(zipBuffer);

  // The zip contains a root folder (openvts-application-master/); strip it
  const entries = Object.entries(zip.files);
  const prefix = entries[0]?.[0]?.split("/")[0] + "/";

  let count = 0;
  for (const [originalPath, entry] of entries) {
    if (entry.dir) continue;
    const relative = originalPath.startsWith(prefix)
      ? originalPath.slice(prefix.length)
      : originalPath;
    if (!relative) continue;

    const destination = path.join(TEMPLATE_ROOT, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    const content = await entry.async("nodebuffer");
    await writeFile(destination, content);
    count++;
  }

  console.log(`  ✓ ${count} files extracted`);
  console.log(`\nTemplate ready at: templates/flutter_base/`);
  console.log(`Data directories ready at: data/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
