import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const options = { skip: process.platform !== "linux" && "SSH workflow runs on Linux" };
async function run(t, changes = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "studio-ssh-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bin = path.join(directory, "bin");
  const log = path.join(directory, "commands.jsonl");
  await mkdir(bin);
  await writeFile(log, "");
  for (const name of ["ssh", "scp"]) {
    await writeFile(path.join(bin, name), `#!/usr/bin/env node\nconst fs=require('node:fs'); fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({tool:${JSON.stringify(name)},args:process.argv.slice(2)})+'\\n'); process.stdin.resume();\n`);
    await chmod(path.join(bin, name), 0o755);
  }
  const result = spawnSync("bash", [new URL("../../scripts/ci-deploy.sh", import.meta.url).pathname], {
    encoding: "utf8", timeout: 10_000,
    env: {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, STUB_LOG: log, RUNNER_TEMP: directory,
      EC2_HOST: "3.108.163.45", EC2_USER: "ubuntu", EC2_SSH_KEY: "test-private-key", EC2_KNOWN_HOSTS: "test-known-host",
      GITHUB_SHA: "a".repeat(40), DEPLOY_IMAGE: `ghcr.io/openvtsofficial/openvts-app-builder@sha256:${"b".repeat(64)}`,
      GHCR_USER: "openvtsofficial", GHCR_TOKEN: "test-registry-token", ...changes,
    },
  });
  const calls = (await readFile(log, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  return { result, calls, directory };
}
test("SSH deployment validates host keys, sends only release configuration and removes credentials", options, async (t) => {
  const { result, calls, directory } = await run(t);
  assert.equal(result.status, 0, result.stderr);
  for (const { args } of calls) {
    assert(args.includes("StrictHostKeyChecking=yes"));
    assert(args.some((argument) => argument.startsWith("UserKnownHostsFile=")));
  }
  const uploads = calls.filter(({ tool }) => tool === "scp");
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].args.at(-2), "docker-compose.prod.yml");
  assert.equal(uploads[1].args.at(-2), "scripts/deploy-studio.sh");
  assert(calls.some(({ args }) => args.at(-1).includes("--password-stdin")));
  assert(!JSON.stringify(calls).includes("test-registry-token"));
  assert(!JSON.stringify(calls).includes("test-private-key"));
  assert(calls.at(-1).args.at(-1).includes("config.json"));
  await assert.rejects(access(path.join(directory, "studio-deploy-key")));
});
test("GitHub bot usernames remain usable without unsafe shell interpolation", options, async (t) => {
  const { result } = await run(t, { GHCR_USER: "dependabot[bot]" });
  assert.equal(result.status, 0, result.stderr);
});
for (const settings of [{ DEPLOY_IMAGE: "ghcr.io/openvtsofficial/openvts-app-builder:latest" }, { EC2_HOST: "wrong-host;command" }, { GHCR_USER: "bad'actor" }]) {
  test(`unsafe SSH inputs rejected before connecting: ${JSON.stringify(settings)}`, options, async (t) => {
    const { result, calls } = await run(t, settings);
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 0);
  });
}
