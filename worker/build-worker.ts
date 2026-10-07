import "dotenv/config";
import { createHash } from "node:crypto";
import { hostname } from "node:os";
import path from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import type { BuildJob, BuildStatus } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/db";
import { env } from "../src/lib/env";
import { materializeFlutterProjectFromGit, zipDirectory } from "../src/lib/flutter-template";
import { createLogger } from "../src/lib/logger";
import { toStudioProject } from "../src/lib/project-mapper";
import { storage } from "../src/lib/storage";
import { configureAndroidSigning } from "../src/lib/android-signing";
import { runBuildCommand } from "../src/lib/build-command";
import { prepareGradleHome } from "../src/lib/android-build";
import { assertHostMemoryHeadroom, HostMemoryError } from "../src/lib/build-resources";

const log = createLogger("build-worker");

const workerId = `${hostname()}-${process.pid}`;
const once = process.argv.includes("--once");
let stopping = false;
let resourceCooldownUntil = 0;
let resourceWaitLoggedAt = 0;
let waitingForMemory = false;
const gradleHome = path.resolve(process.env.GRADLE_USER_HOME || path.join(env.BUILD_WORKSPACE_ROOT, "..", ".gradle"));

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function appendLog(jobId: string, line: string) {
  const timestamped = line.split(/\r?\n/).map((entry) => `[${new Date().toISOString()}] ${entry}\n`).join("");
  await prisma.$executeRaw`UPDATE "BuildJob" SET "buildLog" = RIGHT(COALESCE("buildLog", '') || ${timestamped}, 1000000) WHERE "id" = ${jobId}`;
}

async function setProgress(jobId: string, status: BuildStatus, progress: number, currentStage: string, etaSeconds?: number) {
  const updated = await prisma.buildJob.updateMany({ where: { id: jobId, status: { not: "CANCELLED" } }, data: { status, progress, currentStage, etaSeconds: etaSeconds ?? null, lockedAt: new Date(), lockedBy: workerId } });
  if (!updated.count) throw new Error("Build cancelled by user");
  await appendLog(jobId, currentStage);
}

async function recoverStaleJobs() {
  // Commands refresh their leases every five seconds; Git preparation is bounded
  // by the clone timeout. Recover interrupted jobs without requiring a restart.
  const staleBefore = new Date(Date.now() - Math.max(180_000, env.GIT_CLONE_TIMEOUT_MS + 60_000));
  const interrupted = await prisma.buildJob.findMany({
    where: { status: { in: ["PREPARING", "CUSTOMIZING", "RESOLVING_DEPENDENCIES", "COMPILING", "SIGNING", "UPLOADING"] }, lockedAt: { lt: staleBefore } },
    select: { id: true, attempts: true, maxAttempts: true },
  });
  for (const job of interrupted) {
    const exhausted = job.attempts >= job.maxAttempts;
    await prisma.buildJob.updateMany({
      where: { id: job.id, lockedAt: { lt: staleBefore }, status: { in: ["PREPARING", "CUSTOMIZING", "RESOLVING_DEPENDENCIES", "COMPILING", "SIGNING", "UPLOADING"] } },
      data: exhausted
        ? { status: "FAILED", currentStage: "Worker interrupted; retry limit reached", errorMessage: "Worker interrupted; start a new build", finishedAt: new Date(), lockedAt: null, lockedBy: null }
        : { status: "QUEUED", progress: 0, currentStage: "Recovered after an interrupted worker", errorMessage: null, lockedAt: null, lockedBy: null },
    });
  }
}

async function claimNextJob() {
  let nativeCapacity = Date.now() >= resourceCooldownUntil;
  let capacityMessage = "Waiting for server memory: retry cooling down";
  if (nativeCapacity) {
    try { await assertHostMemoryHeadroom(env.BUILD_MIN_HOST_AVAILABLE_MB); }
    catch (error) {
      if (!(error instanceof HostMemoryError)) throw error;
      nativeCapacity = false;
      capacityMessage = error.message;
    }
  }
  if (!nativeCapacity && (!waitingForMemory || Date.now() - resourceWaitLoggedAt >= 60_000)) {
    await prisma.buildJob.updateMany({ where: { status: "QUEUED", type: { not: "SOURCE_ZIP" } }, data: { currentStage: capacityMessage, etaSeconds: null } });
    log.warn(capacityMessage);
    resourceWaitLoggedAt = Date.now();
    waitingForMemory = true;
  } else if (nativeCapacity && waitingForMemory) {
    await prisma.buildJob.updateMany({ where: { status: "QUEUED", currentStage: { startsWith: "Waiting for server memory" } }, data: { currentStage: "Queued" } });
    waitingForMemory = false;
  }
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(`
      SELECT "id"
      FROM "BuildJob"
      WHERE "status" = 'QUEUED'::"BuildStatus" AND "attempts" < "maxAttempts"
      ${nativeCapacity ? "" : "AND \"type\" = 'SOURCE_ZIP'::\"BuildType\""}
      ORDER BY "priority" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);
    if (!rows[0]) return null;
    return tx.buildJob.update({ where: { id: rows[0].id }, data: { status: "PREPARING", progress: 5, currentStage: "Claimed by build worker", lockedAt: new Date(), lockedBy: workerId, startedAt: new Date(), attempts: { increment: 1 } } });
  }, { timeout: 5_000 });
}

function resolveJavaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Eclipse Adoptium",
      "C:\\Program Files\\Java",
      "C:\\Program Files\\Microsoft",
    ];
    for (const base of candidates) {
      if (!existsSync(base)) continue;
      const dirs = readdirSync(base).filter((d) => d.startsWith("jdk-")).sort().reverse();
      if (dirs.length > 0) return path.join(base, dirs[0]);
    }
  }
  return undefined;
}

function buildSpawnEnv() {
  const javaHome = resolveJavaHome();
  const extra = process.platform === "win32"
    ? {
        PATH: `${process.env.PATH};C:\\WINDOWS\\system32;C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0;C:\\Program Files\\Git\\cmd${javaHome ? `;${javaHome}\\bin` : ""}`,
        ...(javaHome ? { JAVA_HOME: javaHome } : {}),
      }
    : {};
  return {
    ...process.env,
    CI: "true",
    LANG: "C.UTF-8",
    GRADLE_OPTS: "-Dorg.gradle.daemon=false -Dorg.gradle.workers.max=1 -Dorg.gradle.parallel=false",
    GRADLE_USER_HOME: gradleHome,
    ...extra,
  };
}

async function isCancelled(jobId: string): Promise<boolean> {
  const job = await prisma.buildJob.findUnique({ where: { id: jobId }, select: { status: true } });
  return job?.status === "CANCELLED";
}

async function runCommand(jobId: string, command: string, args: string[], cwd: string, timeout = env.BUILD_TIMEOUT_MS) {
  await runBuildCommand({ command, args, cwd, env: buildSpawnEnv(), timeoutMs: timeout, heartbeatMs: 5_000,
    onLog: (line) => appendLog(jobId, line),
    onHeartbeat: async () => {
      if (await isCancelled(jobId)) return true;
      await assertHostMemoryHeadroom(env.BUILD_CRITICAL_HOST_AVAILABLE_MB);
      await prisma.buildJob.updateMany({ where: { id: jobId, lockedBy: workerId }, data: { lockedAt: new Date() } });
      return false;
    },
  });
}

async function runCommandWithRetry(jobId: string, command: string, args: string[], cwd: string, retries = 2, individualTimeout = 300000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await runCommand(jobId, command, args, cwd, individualTimeout);
      return;
    } catch (error) {
      await appendLog(jobId, `Attempt ${attempt}/${retries} failed: ${error instanceof Error ? error.message : String(error)}`);
      if (await isCancelled(jobId) || error instanceof HostMemoryError) throw error;
      if (attempt === retries) throw error;
      await appendLog(jobId, `Retrying in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

async function buildArtifact(job: BuildJob) {
  const projectRecord = await prisma.project.findUnique({ where: { id: job.projectId }, include: { assets: true } });
  if (!projectRecord) throw new Error("Project was deleted before the build started");
  if (projectRecord.configurationRevision !== job.projectRevision) throw new Error("Project configuration changed after this build was requested. Start a new build for the latest revision.");
  const project = toStudioProject(projectRecord);
  const workspace = path.resolve(env.BUILD_WORKSPACE_ROOT, job.id);
  await rm(workspace, { recursive: true, force: true });
  await mkdir(path.dirname(workspace), { recursive: true });

  try {
    // Step 1: Fetch the latest upstream Flutter project for this build.
    await setProgress(job.id, "PREPARING", 10, `Fetching latest ${env.FLUTTER_TEMPLATE_BRANCH} Flutter base from Git`, 260);
    await appendLog(job.id, `Template repository: ${env.FLUTTER_TEMPLATE_REPOSITORY}`);
    await appendLog(job.id, `Template branch: ${env.FLUTTER_TEMPLATE_BRANCH}`);
    await appendLog(job.id, `Workspace: ${workspace}`);

    // Step 2: Apply customizations (package name, app name, icons, logos)
    await setProgress(job.id, "CUSTOMIZING", 25, "Applying package name, app name, logos and launcher icons", 220);

    if (projectRecord.logoLightKey) project.logoLightUrl = `data:image/png;base64,${(await storage.get(projectRecord.logoLightKey)).toString("base64")}`;
    if (projectRecord.logoDarkKey) project.logoDarkUrl = `data:image/png;base64,${(await storage.get(projectRecord.logoDarkKey)).toString("base64")}`;
    const iconArchive = projectRecord.iconArchiveKey ? await storage.get(projectRecord.iconArchiveKey) : undefined;

    const result = await materializeFlutterProjectFromGit({
      project,
      repository: env.FLUTTER_TEMPLATE_REPOSITORY,
      branch: env.FLUTTER_TEMPLATE_BRANCH,
      outputRoot: workspace,
      iconArchive,
      gitBin: env.GIT_BIN,
      cloneTimeoutMs: env.GIT_CLONE_TIMEOUT_MS,
      onLog: (line) => appendLog(job.id, `[template] ${line}`),
    });

    await appendLog(job.id, `Project customized from ${result.templateSource?.branch}@${result.templateSource?.commit.slice(0, 12)}: package=${project.androidPackageName}, bundle=${project.iosBundleId}, icons=${result.iconAssetsInstalled}`);
    for (const adjustment of result.sourceAdjustments) await appendLog(job.id, `Compiler compatibility adjustment: ${adjustment}`);

    // Step 3: Configure signing (keystore is private builder infrastructure, separate from the public Git template)
    const needsSigning = ["RELEASE_APK", "SIGNED_APK", "RELEASE_AAB"].includes(job.type);
    if (needsSigning) {
      await setProgress(job.id, "SIGNING", 32, "Configuring release signing key", 200);
      await configureAndroidSigning(workspace, project.id);
      await appendLog(job.id, `Keystore at: ${path.join(workspace, "android", "app", "release-key.jks")} exists=${existsSync(path.join(workspace, "android", "app", "release-key.jks"))}`);
      await appendLog(job.id, `Key.properties at: ${path.join(workspace, "android", "key.properties")} exists=${existsSync(path.join(workspace, "android", "key.properties"))}`);
      await appendLog(job.id, "Signing key installed");
    }

    // Source exports do not need native tools or dependency resolution.
    if (job.type !== "SOURCE_ZIP") {
      await setProgress(job.id, "RESOLVING_DEPENDENCIES", 40, "Running flutter pub get", 180);
      await runCommandWithRetry(job.id, env.FLUTTER_BIN, ["pub", "get"], workspace, 2, 300_000);
    }
    if (await isCancelled(job.id)) throw new Error("Build cancelled by user");

    let artifactPath: string;
    if (job.type === "SOURCE_ZIP") {
      // Source ZIP: just package the customized project
      await setProgress(job.id, "COMPILING", 80, "Packaging customized source code archive", 35);
      const zipped = await zipDirectory(workspace);
      artifactPath = path.join(workspace, `${project.slug}-source.zip`);
      await writeFile(artifactPath, zipped);
      await appendLog(job.id, `Source archive: ${(zipped.length / 1024 / 1024).toFixed(2)} MB`);
    } else {
      // Build APK or AAB
      await setProgress(job.id, "COMPILING", 55, `Compiling ${job.type.replaceAll("_", " ").toLowerCase()}`);
      const command = job.type === "RELEASE_AAB"
        ? ["build", "appbundle", "--release", "--no-tree-shake-icons"]
        : job.type === "DEBUG_APK"
        ? ["build", "apk", "--debug", "--no-tree-shake-icons"]
        : ["build", "apk", "--release", "--no-tree-shake-icons"];
      await runCommand(job.id, env.FLUTTER_BIN, [...command, "--no-pub"], workspace);

      const outputRoot = path.join(workspace, "build", "app", "outputs");
      await appendLog(job.id, `Searching for artifact in: ${outputRoot}`);
      const expected = path.join(outputRoot, job.type === "RELEASE_AAB" ? "bundle/release/app-release.aab" : `flutter-apk/app-${job.type === "DEBUG_APK" ? "debug" : "release"}.apk`);
      artifactPath = existsSync(expected) ? expected : "";
      if (!artifactPath) {
        const files = await readdir(outputRoot).catch(() => [] as string[]);
        await appendLog(job.id, `Output directory contents: ${JSON.stringify(files).slice(0, 500)}`);
        throw new Error("Flutter completed without producing the expected artifact");
      }
      await appendLog(job.id, `Artifact found: ${path.basename(artifactPath)}`);
    }

    // Step 5: Upload artifact to storage
    await setProgress(job.id, "UPLOADING", 92, "Uploading artifact to storage", 15);
    if (await isCancelled(job.id)) throw new Error("Build cancelled by user");
    const artifact = await readFile(artifactPath);
    const extension = job.type === "RELEASE_AAB" ? "aab" : job.type === "SOURCE_ZIP" ? "zip" : "apk";
    const artifactKey = `${projectRecord.ownerId}/${projectRecord.id}/builds/${job.id}/${project.slug}.${extension}`;
    await storage.put(artifactKey, artifact, extension === "zip" ? "application/zip" : "application/octet-stream");

    // Step 6: Mark as complete
    await prisma.$transaction([
      prisma.buildJob.update({ where: { id: job.id }, data: { status: "SUCCEEDED", progress: 100, currentStage: "Build completed successfully", etaSeconds: 0, finishedAt: new Date(), artifactKey, artifactSize: artifact.length, checksum: createHash("sha256").update(artifact).digest("hex"), lockedAt: null, lockedBy: null } }),
      prisma.project.update({ where: { id: job.projectId }, data: { status: "READY" } }),
    ]);
    await appendLog(job.id, `Artifact uploaded: ${artifactKey} (${(artifact.length / 1024 / 1024).toFixed(2)} MB, sha256=${createHash("sha256").update(artifact).digest("hex").slice(0, 16)}...)`);
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function fail(job: BuildJob, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown build error";
  const current = await prisma.buildJob.findUnique({ where: { id: job.id }, select: { status: true } });
  if (current?.status === "CANCELLED") {
    await appendLog(job.id, "Build was cancelled by user");
    await prisma.project.update({ where: { id: job.projectId }, data: { status: "DRAFT" } });
    return;
  }
  if (error instanceof HostMemoryError && job.attempts < job.maxAttempts) {
    resourceCooldownUntil = Date.now() + 60_000;
    await prisma.buildJob.update({ where: { id: job.id }, data: { status: "QUEUED", progress: 0, currentStage: message, errorMessage: null, etaSeconds: null, startedAt: null, finishedAt: null, lockedAt: null, lockedBy: null } });
    await appendLog(job.id, `${message}; retry deferred for at least 60 seconds`);
    return;
  }
  await prisma.$transaction([
    prisma.buildJob.update({ where: { id: job.id }, data: { status: "FAILED", currentStage: "Build failed", errorMessage: message, etaSeconds: null, finishedAt: new Date(), lockedAt: null, lockedBy: null } }),
    prisma.project.update({ where: { id: job.projectId }, data: { status: "FAILED" } }),
  ]);
  await appendLog(job.id, `ERROR: ${message}`);
}

async function main() {
  log.info(`Starting worker ${workerId}`);
  log.info(`Template repository: ${env.FLUTTER_TEMPLATE_REPOSITORY}`);
  log.info(`Template branch: ${env.FLUTTER_TEMPLATE_BRANCH}`);
  log.info(`Workspace root: ${path.resolve(env.BUILD_WORKSPACE_ROOT)}`);
  log.info(`Flutter binary: ${env.FLUTTER_BIN}`);
  log.info(`Poll interval: ${env.BUILD_POLL_INTERVAL_MS}ms`);
  log.info(`Build timeout: ${env.BUILD_TIMEOUT_MS}ms`);

  await recoverStaleJobs();
  await prepareGradleHome(gradleHome, env.GRADLE_JVM_ARGS);
  process.on("SIGTERM", () => { stopping = true; log.info("SIGTERM received, finishing current job..."); });
  process.on("SIGINT", () => { stopping = true; log.info("SIGINT received, finishing current job..."); });

  let lastRecovery = Date.now();
  do {
    if (Date.now() - lastRecovery > 30_000) {
      await recoverStaleJobs();
      lastRecovery = Date.now();
    }
    const job = await claimNextJob();
    if (!job) { if (once) break; await sleep(env.BUILD_POLL_INTERVAL_MS); continue; }
    log.info(`Processing job ${job.id} (type=${job.type}, project=${job.projectId})`);
    try { await buildArtifact(job); log.info(`Job ${job.id} completed successfully`); }
    catch (error) {
      await fail(job, error);
      const message = `Job ${job.id}: ${error instanceof Error ? error.message : String(error)}`;
      if (error instanceof HostMemoryError && job.attempts < job.maxAttempts) log.warn(message);
      else log.error(message);
    }
  } while (!stopping && !once);

  log.info("Shutting down");
  await prisma.$disconnect();
}

main().catch(async (error) => { log.error(`Fatal: ${error instanceof Error ? error.message : String(error)}`); await prisma.$disconnect(); process.exitCode = 1; });
