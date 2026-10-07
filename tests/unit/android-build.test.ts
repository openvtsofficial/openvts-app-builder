import assert from "node:assert/strict";
import test from "node:test";
import { androidBuildProperties } from "../../src/lib/android-build";
import { prepareGradleHome } from "../../src/lib/android-build";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("upstream memory and machine settings cannot exceed the worker configuration", () => {
  const props = androidBuildProperties("org.gradle.java.home=C:\\jdk\r\norg.gradle.jvmargs=-Xmx8192m\r\norg.gradle.workers.max=16\r\norg.gradle.parallel=true\r\nandroid.useAndroidX=true\r\n");
  assert.doesNotMatch(props, /java.home|8192m|=16|parallel=true/);
  assert.match(props, /-Xmx1024m/);
  assert.match(props, /workers.max=1/);
  assert.match(props, /android.useAndroidX=true/);
  assert.equal(androidBuildProperties(props), props);
});

test("worker-private Gradle settings cover included builds and preserve other settings", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "studio-gradle-test-"));
  try {
    await writeFile(path.join(root, "gradle.properties"), "org.gradle.jvmargs=-Xmx8G\ncustom.setting=keep\n");
    await prepareGradleHome(root);
    const properties = await readFile(path.join(root, "gradle.properties"), "utf8");
    assert.match(properties, /custom.setting=keep/);
    assert.match(properties, /kotlin.compiler.execution.strategy=in-process/);
    assert.match(properties, /-Xmx1024m/);
    assert.doesNotMatch(properties, /-Xmx8G/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
