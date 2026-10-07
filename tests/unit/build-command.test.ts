import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runBuildCommand } from "../../src/lib/build-command";

test("command output bursts and trailing errors are fully flushed", async () => {
  const log: string[] = [];
  await assert.rejects(runBuildCommand({
    command: process.execPath, args: ["-e", "for(let i=0;i<250;i++) console.log('line '+i); process.stderr.write('final error'); process.exitCode=1;"],
    cwd: process.cwd(), timeoutMs: 10_000,
    onLog: async (text) => { await new Promise((resolve) => setTimeout(resolve, 2)); log.push(text); },
  }), /exited with code 1/);
  const text = log.slice(1).join("\n");
  for (let i = 0; i < 250; i++) assert.ok(text.includes(`line ${i}\n`) || text.endsWith(`line ${i}`));
  assert.match(text, /final error/);
});

test("timeout terminates command", async () => {
  await assert.rejects(runBuildCommand({ command: process.execPath, args: ["-e", "setInterval(()=>{},1000)"], cwd: process.cwd(), timeoutMs: 150, onLog: async () => {} }), /exceeded/);
});

test("cancellation terminates command", async () => {
  await assert.rejects(runBuildCommand({ command: process.execPath, args: ["-e", "setInterval(()=>{},1000)"], cwd: process.cwd(), timeoutMs: 10_000, heartbeatMs: 50, onLog: async () => {}, onHeartbeat: async () => true }), /cancelled/);
});

test("Linux timeout also terminates compiler descendants", { skip: process.platform === "win32" }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "studio-process-test-"));
  try {
    const marker = path.join(root, "pid");
    await assert.rejects(runBuildCommand({
      command: process.execPath,
      args: ["-e", `const {spawn}=require('node:child_process'); const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); require('node:fs').writeFileSync(${JSON.stringify(marker)},String(c.pid)); setInterval(()=>{},1000);`],
      cwd: root, timeoutMs: 1_000, onLog: async () => {},
    }), /exceeded/);
    const pid = Number(await readFile(marker, "utf8"));
    // A zombie awaiting reaping is terminated too.
    const status = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "");
    assert.ok(!status || status.split(" ")[2] === "Z");
  } finally { await rm(root, { recursive: true, force: true }); }
});
