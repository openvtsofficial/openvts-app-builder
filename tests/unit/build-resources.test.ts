import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertHostMemoryHeadroom, availableHostMemoryMiB, HostMemoryError } from "../../src/lib/build-resources";
import { runBuildCommand } from "../../src/lib/build-command";

test("host admission uses reclaimable available memory rather than free pages", () => {
  assert.equal(availableHostMemoryMiB("MemFree: 100 kB\nMemAvailable: 3276800 kB\n"), 3200);
  assert.equal(availableHostMemoryMiB("MemFree: 9999999 kB\nMemAvailable: 0 kB\n"), 0);
  assert.equal(availableHostMemoryMiB("MemFree: 9999999 kB\n"), undefined);
});

test("a memory shortage cleanly stops an active compiler command", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "studio-memory-command-"));
  const file = path.join(root, "meminfo");
  try {
    await writeFile(file, "MemAvailable: 3276800 kB\n");
    await assert.rejects(runBuildCommand({
      command: process.execPath, args: ["-e", "console.log('ready'); setInterval(() => {}, 1000)"],
      cwd: root, timeoutMs: 5000, heartbeatMs: 20,
      onLog: async (line) => { if (line === "ready") await writeFile(file, "MemAvailable: 0 kB\n"); },
      onHeartbeat: async () => { await assertHostMemoryHeadroom(512, file); return false; },
    }), HostMemoryError);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("memory checks admit sufficient headroom, defer shortages, and fail closed on invalid Linux data", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "studio-memory-test-"));
  const file = path.join(root, "meminfo");
  try {
    await assertHostMemoryHeadroom(0, file);
    await writeFile(file, "MemAvailable: 3276800 kB\n");
    await assertHostMemoryHeadroom(3200, file);
    await assert.rejects(assertHostMemoryHeadroom(3201, file), HostMemoryError);
    await writeFile(file, "MemFree: 9999999 kB\n");
    await assert.rejects(assertHostMemoryHeadroom(3200, file), /Unable to read host available memory/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
