import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkoutFlutterTemplate } from "../../src/lib/flutter-template-source";
import { createFlutterFixture } from "../fixtures/flutter-project";

test("each Git checkout fetches the latest branch commit and has no local fallback", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "studio-git-test-"));
  const repository = path.join(root, "repository");
  const outputRoot = path.join(root, "output");
  function git(...args: string[]) {
    const result = spawnSync("git", args, { cwd: repository, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  try {
    await createFlutterFixture(repository);
    git("init", "-b", "main");
    git("config", "user.email", "tests@example.invalid");
    git("config", "user.name", "Studio tests");
    git("add", "."); git("commit", "-m", "initial");
    const first = await checkoutFlutterTemplate({ repository, branch: "main", outputRoot });
    assert.equal(first.commit, git("rev-parse", "HEAD"));
    assert.equal(await stat(path.join(outputRoot, ".git")).catch(() => null), null);
    await writeFile(path.join(repository, "latest.txt"), "new upstream code");
    git("add", "."); git("commit", "-m", "latest");
    const second = await checkoutFlutterTemplate({ repository, branch: "main", outputRoot });
    assert.notEqual(second.commit, first.commit);
    assert.equal(await readFile(path.join(outputRoot, "latest.txt"), "utf8"), "new upstream code");
    await assert.rejects(checkoutFlutterTemplate({ repository, branch: "missing", outputRoot }), /Unable to prepare Flutter base/);
    assert.equal(await stat(outputRoot).catch(() => null), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
