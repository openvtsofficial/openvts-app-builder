import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("private artifact downloads stream bounded chunks, preserve bytes and support cancellation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "studio-download-test-"));
  process.env.LOCAL_STORAGE_ROOT = root;
  process.env.STORAGE_DRIVER = "local";
  const { storage } = await import("../../src/lib/storage");
  try {
    const data = randomBytes(2 * 1024 * 1024);
    const key = "owner/project/build/artifact.apk";
    await storage.put(key, data, "application/octet-stream");
    const download = await storage.openDownload(key);
    assert.equal(download.size, data.length);
    const hash = createHash("sha256");
    let chunks = 0;
    let bytes = 0;
    const reader = download.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      assert.ok(value.byteLength <= 64 * 1024);
      hash.update(value);
      bytes += value.byteLength;
      chunks++;
    }
    assert.ok(chunks > 1);
    assert.equal(bytes, data.length);
    assert.equal(hash.digest("hex"), createHash("sha256").update(data).digest("hex"));
    const cancelled = (await storage.openDownload(key)).body.getReader();
    await cancelled.read();
    await cancelled.cancel();
    await storage.remove(key);
    await assert.rejects(storage.openDownload("../artifact.apk"), /Unsafe storage key/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
