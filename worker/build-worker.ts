import "dotenv/config";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { hostname } from "node:os";
import path from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import type { BuildJob, BuildStatus } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/db";
import { env } from "../src/lib/env";
import { materializeFlutterProject, zipDirectory } from "../src/lib/flutter-template";
import { createLogger } from "../src/lib/logger";
import { toStudioProject } from "../src/lib/project-mapper";
import { storage } from "../src/lib/storage";

const log = createLogger("build-worker");

const workerId = `${hostname()}-${process.pid}`;
const once = process.argv.includes("--once");
let stopping = false;

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function appendLog(jobId: string, line: string) {
  const timestamped = `[${new Date().toISOString()}] ${line}`;
  const existing = await prisma.buildJob.findUnique({ where: { id: jobId }, select: { buildLog: true } });
  const next = `${existing?.buildLog ?? ""}${timestamped}\n`.slice(-1_000_000);
  await prisma.buildJob.update({ where: { id: jobId }, data: { buildLog: next } });
}

async function setProgress(jobId: string, status: BuildStatus, progress: number, currentStage: string, etaSeconds?: number) {
  await prisma.buildJob.update({ where: { id: jobId }, data: { status, progress, currentStage, etaSeconds, lockedAt: new Date(), lockedBy: workerId } });
  await appendLog(jobId, currentStage);
}

async function recoverStaleJobs() {
  const staleBefore = new Date(Date.now() - env.BUILD_TIMEOUT_MS - 60_000);
  await prisma.buildJob.updateMany({
    where: { status: { in: ["PREPARING", "CUSTOMIZING", "RESOLVING_DEPENDENCIES", "COMPILING", "SIGNING", "UPLOADING"] }, lockedAt: { lt: staleBefore } },
    data: { status: "QUEUED", progress: 0, currentStage: "Recovered after an interrupted worker", lockedAt: null, lockedBy: null },
  });
}

async function claimNextJob() {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(`
      SELECT "id"
      FROM "BuildJob"
      WHERE "status" = 'QUEUED'::"BuildStatus" AND "attempts" < "maxAttempts"
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
    GRADLE_OPTS: "-Dorg.gradle.daemon=false -Dorg.gradle.workers.max=2 -Dorg.gradle.parallel=false",
    ...extra,
  };
}

async function isCancelled(jobId: string): Promise<boolean> {
  const job = await prisma.buildJob.findUnique({ where: { id: jobId }, select: { status: true } });
  return job?.status === "CANCELLED";
}

async function runCommand(jobId: string, command: string, args: string[], cwd: string, timeout = env.BUILD_TIMEOUT_MS) {
  await appendLog(jobId, `$ ${command} ${args.join(" ")}`);
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: buildSpawnEnv(), stdio: ["ignore", "pipe", "pipe"], shell: true });
    let settled = false;
    let buffered = "";
    let lastActivity = Date.now();

    const consume = (chunk: Buffer) => {
      lastActivity = Date.now();
      buffered += chunk.toString("utf8");
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? "";
      for (const line of lines.filter(Boolean).slice(-100)) void appendLog(jobId, line.slice(0, 2_000));
    };

    child.stdout.on("data", consume);
    child.stderr.on("data", consume);

    const timer = setTimeout(() => { if (!settled) { child.kill("SIGKILL"); reject(new Error(`Command exceeded ${Math.round(timeout / 1000)} seconds`)); } }, timeout);

    const heartbeatInterval = setInterval(async () => {
      if (await isCancelled(jobId)) {
        clearInterval(heartbeatInterval);
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          child.kill("SIGKILL");
          reject(new Error("Build cancelled by user"));
        }
        return;
      }
      const silentFor = Date.now() - lastActivity;
      if (silentFor > 600000) {
        clearInterval(heartbeatInterval);
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          child.kill("SIGKILL");
          reject(new Error(`Build hung - no output for ${Math.round(silentFor / 1000)}s`));
        }
      }
    }, 30000);

    child.on("error", (error) => { if (settled) return; settled = true; clearTimeout(timer); clearInterval(heartbeatInterval); reject(error); });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(heartbeatInterval);
      if (buffered.trim()) void appendLog(jobId, buffered.trim().slice(0, 2_000));
      if (code === 0) resolve(); else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function runCommandWithRetry(jobId: string, command: string, args: string[], cwd: string, retries = 2, individualTimeout = 300000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await runCommand(jobId, command, args, cwd, individualTimeout);
      return;
    } catch (error) {
      await appendLog(jobId, `Attempt ${attempt}/${retries} failed: ${error instanceof Error ? error.message : String(error)}`);
      if (attempt === retries) throw error;
      await appendLog(jobId, `Retrying in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

async function findFirst(root: string, predicate: (name: string) => boolean): Promise<string | undefined> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) { const nested = await findFirst(absolute, predicate); if (nested) return nested; }
    else if (predicate(entry.name)) return absolute;
  }
  return undefined;
}

function propertyEscape(value: string) { return value.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("=", "\\="); }

async function configureSigning(workspace: string) {
  const keystoreSrc = path.join(workspace, "assets", "application-key.jks");
  if (!existsSync(keystoreSrc)) return false;
  const destination = path.join(workspace, "android", "app", "release-key.jks");
  await writeFile(destination, await readFile(keystoreSrc), { mode: 0o600 });
  const properties = [
    `storePassword=${propertyEscape("Open@321Stack")}`,
    `keyPassword=${propertyEscape("Open@321Stack")}`,
    `keyAlias=${propertyEscape("open-vts-upload")}`,
    "storeFile=release-key.jks",
  ].join("\n");
  await writeFile(path.join(workspace, "android", "app", "key.properties"), `${properties}\n`, { mode: 0o600 });
  return true;
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
    // Kill any orphaned Gradle daemons from prior builds to free memory
    await new Promise<void>((resolve) => {
      const kill = spawn("pkill", ["-f", "GradleDaemon"], { stdio: "ignore" });
      kill.on("close", () => resolve());
      kill.on("error", () => resolve());
    });

    // Step 1: Copy and customize the base Flutter project
    await setProgress(job.id, "PREPARING", 10, "Copying base Flutter project from template", 260);
    await appendLog(job.id, `Template root: ${path.resolve(env.FLUTTER_TEMPLATE_ROOT)}`);
    await appendLog(job.id, `Workspace: ${workspace}`);

    // Step 2: Apply customizations (package name, app name, icons, logos)
    await setProgress(job.id, "CUSTOMIZING", 25, "Applying package name, app name, logos and launcher icons", 220);

    if (projectRecord.logoLightKey) project.logoLightUrl = `data:image/png;base64,${(await storage.get(projectRecord.logoLightKey)).toString("base64")}`;
    if (projectRecord.logoDarkKey) project.logoDarkUrl = `data:image/png;base64,${(await storage.get(projectRecord.logoDarkKey)).toString("base64")}`;
    const iconArchive = projectRecord.iconArchiveKey ? await storage.get(projectRecord.iconArchiveKey) : undefined;

    const result = await materializeFlutterProject({
      project,
      templateRoot: path.resolve(env.FLUTTER_TEMPLATE_ROOT),
      outputRoot: workspace,
      iconArchive,
    });

    await appendLog(job.id, `Project customized: package=${project.androidPackageName}, bundle=${project.iosBundleId}, icons=${result.iconAssetsInstalled}`);

    // Step 3: Configure signing (uses bundled keystore from template)
    const needsSigning = ["SIGNED_APK", "RELEASE_AAB"].includes(job.type);
    if (needsSigning) {
      await setProgress(job.id, "SIGNING", 32, "Configuring release signing key", 200);
      const configured = await configureSigning(workspace);
      if (!configured) throw new Error("Bundled signing keystore not found in template");
      await appendLog(job.id, `Keystore at: ${path.join(workspace, "android", "app", "release-key.jks")} exists=${existsSync(path.join(workspace, "android", "app", "release-key.jks"))}`);
      await appendLog(job.id, `Key.properties at: ${path.join(workspace, "android", "app", "key.properties")} exists=${existsSync(path.join(workspace, "android", "app", "key.properties"))}`);
      await appendLog(job.id, "Signing key installed");
    }

    // Step 4: Resolve Flutter dependencies
    await setProgress(job.id, "RESOLVING_DEPENDENCIES", 40, "Running flutter pub get", 180);
    await runCommandWithRetry(job.id, env.FLUTTER_BIN, ["pub", "get"], workspace, 2, 300_000);

    let artifactPath: string;
    if (job.type === "SOURCE_ZIP") {
      // Source ZIP: just package the customized project
      await setProgress(job.id, "COMPILING", 80, "Packaging customized source code archive", 35);
      const zipped = await zipDirectory(workspace);
      artifactPath = path.join(path.dirname(workspace), `${project.slug}-source.zip`);
      await writeFile(artifactPath, zipped);
      await appendLog(job.id, `Source archive: ${(zipped.length / 1024 / 1024).toFixed(2)} MB`);
    } else {
      // Build APK or AAB
      await setProgress(job.id, "COMPILING", 55, `Compiling ${job.type.replaceAll("_", " ").toLowerCase()}`, 150);
      const command = job.type === "RELEASE_AAB"
        ? ["build", "appbundle", "--release", "--no-tree-shake-icons"]
        : job.type === "DEBUG_APK"
        ? ["build", "apk", "--debug", "--no-tree-shake-icons"]
        : ["build", "apk", "--release", "--no-tree-shake-icons"];
      await runCommand(job.id, env.FLUTTER_BIN, command, workspace);

      const outputRoot = path.join(workspace, "build", "app", "outputs");
      await appendLog(job.id, `Searching for artifact in: ${outputRoot}`);
      artifactPath = (await findFirst(outputRoot, (name) =>
        job.type === "RELEASE_AAB" ? name.endsWith(".aab") : name.endsWith(".apk")
      )) ?? "";
      if (!artifactPath) {
        const files = await readdir(outputRoot, { recursive: true } as any).catch(() => [] as string[]);
        await appendLog(job.id, `Output directory contents: ${JSON.stringify(files).slice(0, 500)}`);
        throw new Error("Flutter completed without producing the expected artifact");
      }
      await appendLog(job.id, `Artifact found: ${path.basename(artifactPath)}`);
    }

    // Step 5: Upload artifact to storage
    await setProgress(job.id, "UPLOADING", 92, "Uploading artifact to storage", 15);
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
  await prisma.$transaction([
    prisma.buildJob.update({ where: { id: job.id }, data: { status: "FAILED", currentStage: "Build failed", errorMessage: message, etaSeconds: null, finishedAt: new Date(), lockedAt: null, lockedBy: null } }),
    prisma.project.update({ where: { id: job.projectId }, data: { status: "FAILED" } }),
  ]);
  await appendLog(job.id, `ERROR: ${message}`);
}

async function main() {
  log.info(`Starting worker ${workerId}`);
  log.info(`Template root: ${path.resolve(env.FLUTTER_TEMPLATE_ROOT)}`);
  log.info(`Workspace root: ${path.resolve(env.BUILD_WORKSPACE_ROOT)}`);
  log.info(`Flutter binary: ${env.FLUTTER_BIN}`);
  log.info(`Poll interval: ${env.BUILD_POLL_INTERVAL_MS}ms`);
  log.info(`Build timeout: ${env.BUILD_TIMEOUT_MS}ms`);

  await recoverStaleJobs();
  process.on("SIGTERM", () => { stopping = true; log.info("SIGTERM received, finishing current job..."); });
  process.on("SIGINT", () => { stopping = true; log.info("SIGINT received, finishing current job..."); });

  do {
    const job = await claimNextJob();
    if (!job) { if (once) break; await sleep(env.BUILD_POLL_INTERVAL_MS); continue; }
    log.info(`Processing job ${job.id} (type=${job.type}, project=${job.projectId})`);
    try { await buildArtifact(job); log.info(`Job ${job.id} completed successfully`); }
    catch (error) { await fail(job, error); log.error(`Job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`); }
  } while (!stopping && !once);

  log.info("Shutting down");
  await prisma.$disconnect();
}

main().catch(async (error) => { log.error(`Fatal: ${error instanceof Error ? error.message : String(error)}`); await prisma.$disconnect(); process.exitCode = 1; });
