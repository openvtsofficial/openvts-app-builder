import { spawn } from "node:child_process";

interface BuildCommandOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  silenceTimeoutMs?: number;
  heartbeatMs?: number;
  onLog: (text: string) => Promise<void>;
  onHeartbeat?: () => Promise<boolean>;
}

export async function runBuildCommand(options: BuildCommandOptions) {
  const { command, args, cwd, env, timeoutMs, onLog, onHeartbeat } = options;
  await onLog(`$ ${command} ${args.join(" ")}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd, env, stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32" && (command === "flutter" || /\.(cmd|bat)$/i.test(command)),
      detached: process.platform !== "win32",
    });
    let failure: Error | undefined;
    let lastActivity = Date.now();
    let logQueue = Promise.resolve();
    let checking = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const buffers = { stdout: "", stderr: "" };
    const enqueue = (text: string) => {
      if (text) logQueue = logQueue.then(() => onLog(text)).catch((error: unknown) => {
        stop(error instanceof Error ? error : new Error(String(error)));
      });
    };
    const signalTree = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        try { process.kill(-child.pid, signal); } catch { /* Already exited. */ }
      }
    };
    const stop = (error: Error) => {
      if (failure) return;
      failure = error;
      signalTree("SIGTERM");
      killTimer = setTimeout(() => signalTree("SIGKILL"), 5_000);
    };
    const consume = (chunk: Buffer, stream: keyof typeof buffers) => {
      lastActivity = Date.now();
      buffers[stream] += chunk.toString("utf8");
      const lines = buffers[stream].split(/[\r\n]+/);
      buffers[stream] = lines.pop() ?? "";
      enqueue(lines.filter(Boolean).map((line) => line.slice(0, 4_000)).join("\n"));
    };
    child.stdout.on("data", (chunk: Buffer) => consume(chunk, "stdout"));
    child.stderr.on("data", (chunk: Buffer) => consume(chunk, "stderr"));
    const timer = setTimeout(() => stop(new Error(`Command exceeded ${Math.round(timeoutMs / 1000)} seconds`)), timeoutMs);
    const heartbeat = setInterval(() => {
      if (checking || failure) return;
      checking = true;
      void (async () => {
        if (await onHeartbeat?.()) stop(new Error("Build cancelled by user"));
        else if (options.silenceTimeoutMs !== undefined && Date.now() - lastActivity > options.silenceTimeoutMs) stop(new Error("Build stopped producing output"));
      })().catch((error: unknown) => stop(error instanceof Error ? error : new Error(String(error)))).finally(() => { checking = false; });
    }, options.heartbeatMs ?? 15_000);
    child.on("error", (error) => { stop(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      clearInterval(heartbeat);
      if (killTimer) clearTimeout(killTimer);
      // Descendants such as Kotlin daemons must not survive a finished job.
      signalTree("SIGKILL");
      enqueue(buffers.stdout.trim());
      enqueue(buffers.stderr.trim());
      void logQueue.then(() => {
        if (failure) reject(failure);
        else if (code !== 0) reject(new Error(`${command} exited with code ${code}`));
        else resolve();
      });
    });
  });
}
