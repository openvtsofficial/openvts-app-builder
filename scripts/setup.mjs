#!/usr/bin/env node
/**
 * Prepares local data directories for OpenVTS App Studio.
 *
 * The Flutter base application is intentionally NOT downloaded here. Every
 * source export and native build checks out the configured Git repository at
 * build time so the job always starts from the latest configured branch.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_DIRS = [
  path.join(ROOT, "data"),
  path.join(ROOT, "data", "workspaces"),
  path.join(ROOT, "data", "artifacts"),
  path.join(ROOT, "data", "uploads"),
  path.join(ROOT, "data", "logs"),
];

async function main() {
  for (const dir of DATA_DIRS) {
    await mkdir(dir, { recursive: true });
    console.log(`  ✓ ${path.relative(ROOT, dir)}/`);
  }

  console.log("\nRuntime Flutter template source:");
  console.log(`  repository: ${process.env.FLUTTER_TEMPLATE_REPOSITORY || "https://github.com/openvtsofficial/openvts-application.git"}`);
  console.log(`  branch: ${process.env.FLUTTER_TEMPLATE_BRANCH || "main"}`);
  console.log("  mode: fresh shallow checkout per source/build job");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
