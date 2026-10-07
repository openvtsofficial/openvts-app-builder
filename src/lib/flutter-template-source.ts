import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

export interface GitTemplateSource {
  provider: "git";
  repository: string;
  branch: string;
  commit: string;
  committedAt?: string;
}

interface CheckoutOptions {
  repository: string;
  branch: string;
  outputRoot: string;
  gitBin?: string;
  timeoutMs?: number;
  onLog?: (line: string) => void | Promise<void>;
}

function safeRepositoryLabel(repository: string) {
  try {
    const url = new URL(repository);
    if (url.username || url.password) {
      url.username = "";
      url.password = "";
    }
    return url.toString();
  } catch {
    return repository;
  }
}

function validateBranch(branch: string) {
  if (!branch || branch.length > 200 || branch.startsWith("-") || /\s/.test(branch) || branch.includes("..")) {
    throw new Error("Invalid Flutter template Git branch");
  }
}

async function runGit({
  gitBin,
  args,
  cwd,
  timeoutMs,
  onLog,
}: {
  gitBin: string;
  args: string[];
  cwd?: string;
  timeoutMs: number;
  onLog?: (line: string) => void | Promise<void>;
}) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(gitBin, args, {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const emit = (chunk: Buffer, target: "stdout" | "stderr") => {
      const text = chunk.toString("utf8");
      if (target === "stdout") stdout += text;
      else stderr += text;
      if (onLog) {
        for (const line of text.split(/[\r\n]+/).map((value) => value.trim()).filter(Boolean)) {
          void Promise.resolve(onLog(line.slice(0, 2_000))).catch(() => undefined);
        }
      }
    };

    child.stdout.on("data", (chunk: Buffer) => emit(chunk, "stdout"));
    child.stderr.on("data", (chunk: Buffer) => emit(chunk, "stderr"));

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`Git command exceeded ${Math.round(timeoutMs / 1000)} seconds`));
    }, timeoutMs);

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Unable to execute Git: ${error.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        const detail = stderr.trim().split(/\r?\n/).slice(-3).join(" ");
        reject(new Error(`Git exited with code ${code}${detail ? `: ${detail}` : ""}`));
      }
    });
  });
}

async function assertFlutterTemplate(root: string) {
  const required = ["pubspec.yaml", "android", "ios", "lib"];
  for (const entry of required) {
    try {
      await access(path.join(root, entry));
    } catch {
      throw new Error(`Git template is not a compatible Flutter application: missing ${entry}`);
    }
  }

  const pubspec = await readFile(path.join(root, "pubspec.yaml"), "utf8");
  if (!/^name:\s*[a-zA-Z0-9_]+\s*$/m.test(pubspec)) {
    throw new Error("Git template pubspec.yaml does not contain a valid Flutter package name");
  }

  const androidApp = path.join(root, "android", "app");
  const iosRunner = path.join(root, "ios", "Runner");
  if (!(await stat(androidApp).catch(() => undefined))?.isDirectory()) {
    throw new Error("Git template is missing android/app");
  }
  if (!(await stat(iosRunner).catch(() => undefined))?.isDirectory()) {
    throw new Error("Git template is missing ios/Runner");
  }
}

export async function checkoutFlutterTemplate({
  repository,
  branch,
  outputRoot,
  gitBin = "git",
  timeoutMs = 120_000,
  onLog,
}: CheckoutOptions): Promise<GitTemplateSource> {
  validateBranch(branch);
  if (!repository.trim()) throw new Error("Flutter template Git repository is not configured");

  const repositoryLabel = safeRepositoryLabel(repository);
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(path.dirname(outputRoot), { recursive: true });

  try {
    await onLog?.(`Fetching Flutter base from ${repositoryLabel} (branch: ${branch})`);
    await runGit({
      gitBin,
      args: ["clone", "--depth", "1", "--single-branch", "--no-tags", "--branch", branch, "--", repository, outputRoot],
      timeoutMs,
      onLog,
    });

    await assertFlutterTemplate(outputRoot);

    const commit = await runGit({ gitBin, args: ["rev-parse", "HEAD"], cwd: outputRoot, timeoutMs: 30_000 });
    const committedAt = await runGit({ gitBin, args: ["show", "-s", "--format=%cI", "HEAD"], cwd: outputRoot, timeoutMs: 30_000 }).catch(() => "");

    // Generated applications should be clean source trees, not shallow clones of the upstream repository.
    await rm(path.join(outputRoot, ".git"), { recursive: true, force: true });

    await onLog?.(`Using Flutter base commit ${commit.slice(0, 12)}`);
    return {
      provider: "git",
      repository: repositoryLabel,
      branch,
      commit,
      committedAt: committedAt || undefined,
    };
  } catch (error) {
    await rm(outputRoot, { recursive: true, force: true }).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to prepare Flutter base from Git repository ${repositoryLabel}@${branch}: ${message}`);
  }
}
