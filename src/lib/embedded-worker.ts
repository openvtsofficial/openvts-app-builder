import { spawn } from "node:child_process";
import path from "node:path";

let started = false;

export function startEmbeddedWorker() {
  if (started) return;
  started = true;

  const workerScript = path.resolve(process.cwd(), "worker", "build-worker.ts");
  const tsxPath = path.resolve(process.cwd(), "node_modules", ".bin", "tsx");

  const extraPath = process.platform === "win32"
    ? `;C:\\WINDOWS\\system32;C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0;C:\\Program Files\\Git\\cmd`
    : "";

  const child = spawn(tsxPath, [workerScript], {
    cwd: process.cwd(),
    env: { ...process.env, PATH: `${process.env.PATH}${extraPath}` },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    detached: false,
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) {
      console.log(`[worker] ${line}`);
    }
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) {
      console.error(`[worker] ${line}`);
    }
  });

  child.on("exit", (code) => {
    console.log(`[worker] Process exited with code ${code}, restarting in 5s...`);
    started = false;
    setTimeout(startEmbeddedWorker, 5000);
  });

  console.log(`[worker] Build worker started (PID ${child.pid})`);
}
