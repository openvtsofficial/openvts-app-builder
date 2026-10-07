import assert from "node:assert/strict";
import { access, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { prisma } from "../src/lib/db.ts";

try {
  assert.equal(process.env.NEXT_PUBLIC_DEMO_MODE, "false", "Production demo mode must be disabled");
  assert.equal(Number(process.versions.node.split(".")[0]), 24, "Expected Node 24");
  await prisma.$queryRaw`SELECT 1`;
  await prisma.project.count();
  await prisma.buildJob.count();
  await prisma.signingProfile.count();

  const flutter = JSON.parse(execFileSync(process.env.FLUTTER_BIN || "/opt/flutter/bin/flutter", ["--version", "--machine"], {
    encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"],
  }));
  assert.equal(flutter.frameworkVersion, "3.44.8", "Unexpected Flutter version");
  const java = spawnSync("java", ["-version"], { encoding: "utf8", timeout: 10_000 });
  assert.equal(java.status, 0, "Java is unavailable");
  assert.match(java.stderr, /version "17\./, "Expected Java 17");
  for (const file of [
    "/opt/android-sdk/platforms/android-36/android.jar",
    "/opt/android-sdk/build-tools/35.0.0/apksigner",
    "/opt/android-sdk/ndk/28.2.13676358/ndk-build",
    "/opt/android-sdk/cmake/3.22.1/bin/cmake",
  ]) await access(file, constants.R_OK);

  const files = await readdir(".");
  assert(!files.includes("templates"), "A local Flutter template must not be in the image");
  assert(!files.some((file) => file.startsWith(".env") && file !== ".env.example"), "Environment secrets must not be in the image");
  if (process.argv.includes("--check-key")) {
    await access(process.env.SIGNING_KEYSTORE_PATH, constants.R_OK);
    for (const name of ["SIGNING_KEY_ALIAS", "SIGNING_STORE_PASSWORD", "SIGNING_KEY_PASSWORD"]) {
      assert(process.env[name], `Missing ${name}`);
    }
  } else {
    assert(!files.includes("signing"), "Signing keys must not be baked into the image");
  }
  console.log("Production runtime, database schema, Flutter and Android SDK checks passed");
} finally {
  await prisma.$disconnect();
}
