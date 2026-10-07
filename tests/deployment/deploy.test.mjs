import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, cp, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const image = `ghcr.io/openvtsofficial/openvts-app-builder@sha256:${"b".repeat(64)}`;
const release = "c".repeat(40);
const oldApp = `sha256:${"1".repeat(64)}`;
const oldWorker = `sha256:${"2".repeat(64)}`;
const newImage = `sha256:${"3".repeat(64)}`;
const environment = "AUTH_SECRET=keep-existing-secret\nDOCKER_IMAGE=previous-image\n";
const dockerStub = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({args, image:process.env.DOCKER_IMAGE})+'\n');
let state = JSON.parse(fs.readFileSync(process.env.STUB_STATE));
const save = () => fs.writeFileSync(process.env.STUB_STATE,JSON.stringify(state));
const fail = name => {if(process.env.STUB_FAIL === name) process.exit(1);};
if(args[0] === 'compose') {
  if(args.includes('config')) console.log(fs.readFileSync(process.env.STUB_CONFIG,'utf8'));
  else if(args.includes('run')) {
    if(args.includes('migrate')) fail('migration');
    if(args.includes('scripts/deployment-probe.mjs')) fail('probe');
  } else if(args.includes('up')) {
    const files = args.filter((_,i)=>args[i-1]==='-f');
    const override = files.find(f=>f.endsWith('images.json'));
    const services = args.slice(args.indexOf('up')+1).filter(a=>a==='app'||a==='worker');
    if(!override && services.includes('worker')) fail('worker');
    for(const service of services) {
      state[service] = override ? JSON.parse(fs.readFileSync(override)).services[service].image : process.env.STUB_NEW_IMAGE;
    }
    save();
  }
} else if(args[0] === 'inspect') {
  const format = args[args.indexOf('--format')+1];
  const container = args.at(-1);
  if(format.includes('compose.project')) console.log(process.env.STUB_FAIL==='ownership'?'other':'app');
  else if(format.includes('State.Running')) console.log('true');
  else if(format.includes('State.OOMKilled')) console.log('false');
  else if(format.includes('RestartCount')) console.log('0');
  else if(format.includes('.Image')) console.log(state[container==='studio-openvts'?'app':'worker']);
} else if(args[0]==='image') console.log(process.env.STUB_NEW_IMAGE);
else if(args[0]==='pull') fail('pull');
else if(args[0]==='ps') console.log('studio-openvts app-id\nstudio-worker worker-id\nother-app untouched-id');
`;

async function scenario(t, { failure = "", mode, imageReference = image, wrongVolume = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "studio-deploy-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const app = path.join(root, "app");
  const candidate = path.join(root, "release");
  const bin = path.join(root, "bin");
  await mkdir(path.join(app, "signing"), { recursive: true });
  await mkdir(path.join(candidate, "scripts"), { recursive: true });
  await mkdir(bin);
  await cp(new URL("../../scripts/deploy-studio.sh", import.meta.url), path.join(candidate, "scripts/deploy-studio.sh"));
  await writeFile(path.join(candidate, "docker-compose.prod.yml"), "candidate config\n");
  await writeFile(path.join(app, "docker-compose.prod.yml"), "original config\n");
  await writeFile(path.join(app, ".env.production"), environment);
  await writeFile(path.join(app, ".env"), environment);
  await writeFile(path.join(app, "signing/application-key.jks"), "existing-test-key");
  const config = { name: "app", volumes: { "studio-data": { name: wrongVolume ? "wrong-volume" : "app_studio-data", external: true } }, services: {} };
  for (const [name, memory, cpus] of [["app", 536870912, "1.0"], ["worker", 3670016000, "2.0"]]) {
    config.services[name] = {
      deploy: { resources: { limits: { memory, cpus } } }, networks: { compose_openvts: null },
      volumes: [{ target: "/app/data", source: "studio-data" }, { target: "/app/signing", source: path.join(app, "signing"), read_only: true }],
      environment: {
        FLUTTER_TEMPLATE_REPOSITORY: "https://github.com/openvtsofficial/openvts-application.git", FLUTTER_TEMPLATE_BRANCH: "main", BUILD_TIMEOUT_MS: "3600000",
        BUILD_MIN_HOST_AVAILABLE_MB: "3200", BUILD_CRITICAL_HOST_AVAILABLE_MB: "512", GRADLE_JVM_ARGS: "-Xmx768m",
      }, ports: [{ host_ip: "127.0.0.1", published: "8082" }],
    };
  }
  const configPath = path.join(root, "config.json");
  const statePath = path.join(root, "state.json");
  const logPath = path.join(root, "commands.jsonl");
  await writeFile(configPath, JSON.stringify(config));
  await writeFile(statePath, JSON.stringify({ app: oldApp, worker: oldWorker }));
  await writeFile(logPath, "");
  const tools = {
    docker: dockerStub,
    sudo: "#!/usr/bin/env bash\n[[ $1 == -n ]] || exit 1\nshift\nexec \"$@\"\n",
    sleep: "#!/usr/bin/env bash\nexit 0\n",
    curl: "#!/usr/bin/env bash\n[[ $STUB_FAIL != health ]] || exit 22\nprintf '%s' '{\"status\":\"ok\",\"mode\":\"production\"}'\n",
    df: "#!/usr/bin/env bash\nprintf 'Filesystem 1B-blocks Used Available Use%% Mounted\\n/fake 100000000000 1000000000 99000000000 1%% /\\n'\n",
    awk: "#!/usr/bin/env bash\nif [[ $* == *'/proc/meminfo'* ]]; then echo 4194304; else exec /usr/bin/awk \"$@\"; fi\n",
  };
  for (const [name, source] of Object.entries(tools)) {
    await writeFile(path.join(bin, name), source);
    await chmod(path.join(bin, name), 0o755);
  }
  const result = spawnSync("bash", [path.join(candidate, "scripts/deploy-studio.sh"), imageReference, release, ...(mode ? [mode] : [])], {
    encoding: "utf8", timeout: 15_000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, STUDIO_APP_ROOT: app, STUB_CONFIG: configPath, STUB_STATE: statePath, STUB_LOG: logPath, STUB_FAIL: failure, STUB_NEW_IMAGE: newImage },
  });
  const commands = (await readFile(logPath, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  return {
    result, commands, app,
    state: JSON.parse(await readFile(statePath, "utf8")),
    environment: await readFile(path.join(app, ".env.production"), "utf8"),
    legacyEnvironment: await readFile(path.join(app, ".env"), "utf8"),
    key: await readFile(path.join(app, "signing/application-key.jks"), "utf8"),
  };
}

const options = { skip: process.platform !== "linux" && "Deployment controller runs on Linux" };
test("successful deployment preserves secrets/key and promotes exactly the tested image", options, async (t) => {
  const outcome = await scenario(t);
  assert.equal(outcome.result.status, 0, outcome.result.stderr);
  assert.deepEqual(outcome.state, { app: newImage, worker: newImage });
  assert(outcome.environment.includes("AUTH_SECRET=keep-existing-secret"));
  assert(outcome.environment.includes(`DOCKER_IMAGE=${image}`));
  assert.equal(outcome.legacyEnvironment, outcome.environment);
  assert.equal(outcome.key, "existing-test-key");
  const commands = outcome.commands.map(({ args }) => args);
  assert.deepEqual(commands.find((args) => args[0] === "stop"), ["stop", "--time", "4200", "studio-worker"]);
  assert.deepEqual(commands.find((args) => args[0] === "pull"), ["pull", image]);
  assert(commands.findIndex((args) => args.includes("migrate")) < commands.findIndex((args) => args.includes("up")));
  assert(!commands.some((args) => args.includes("down") || args.includes("prune") || args.includes("--remove-orphans")));
});
for (const failure of ["pull", "migration", "probe", "health", "worker"]) {
  test(`${failure} failure restores each previous image and preserves the key/configuration`, options, async (t) => {
    const outcome = await scenario(t, { failure });
    assert.notEqual(outcome.result.status, 0);
    assert.deepEqual(outcome.state, { app: oldApp, worker: oldWorker });
    assert.equal(outcome.environment, environment);
    assert.equal(outcome.legacyEnvironment, environment);
    assert.equal(outcome.key, "existing-test-key");
    assert.equal(await readFile(path.join(outcome.app, "docker-compose.prod.yml"), "utf8"), "original config\n");
    assert(outcome.result.stderr.includes("restoring the previous Studio images"));
    if (["pull", "migration", "probe"].includes(failure)) {
      assert(!outcome.commands.some(({ args }) => args.includes("up")), "Early failures must leave the running web container alone");
    }
  });
}
test("preflight checks never stop or restart a service", options, async (t) => {
  const outcome = await scenario(t, { mode: "--check" });
  assert.equal(outcome.result.status, 0, outcome.result.stderr);
  assert(!outcome.commands.some(({ args }) => args.includes("stop") || args.includes("up") || args.includes("pull")));
  assert.deepEqual(outcome.state, { app: oldApp, worker: oldWorker });
});
for (const settings of [{ failure: "ownership" }, { wrongVolume: true }, { imageReference: "ghcr.io/openvtsofficial/openvts-app-builder:latest" }]) {
  test(`unsafe deployment rejected before touching services: ${JSON.stringify(settings)}`, options, async (t) => {
    const outcome = await scenario(t, settings);
    assert.notEqual(outcome.result.status, 0);
    assert(!outcome.commands.some(({ args }) => args.includes("stop") || args.includes("up") || args.includes("pull")));
    assert.deepEqual(outcome.state, { app: oldApp, worker: oldWorker });
  });
}
