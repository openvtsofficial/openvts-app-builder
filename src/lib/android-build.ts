export const defaultGradleJvmArgs = "-Xmx1024m -XX:MaxMetaspaceSize=384m -XX:ReservedCodeCacheSize=128m -XX:+HeapDumpOnOutOfMemoryError";

// Keep the complete native build inside the worker's memory budget. In-process
// Kotlin avoids a second JVM; one Gradle worker avoids parallel compiler heaps.
export function androidBuildProperties(contents: string, jvmArgs = defaultGradleJvmArgs) {
  const overrides: Record<string, string> = {
    "org.gradle.jvmargs": jvmArgs,
    "org.gradle.daemon": "false",
    "org.gradle.workers.max": "1",
    "org.gradle.parallel": "false",
    "kotlin.compiler.execution.strategy": "in-process",
    "kotlin.incremental": "false",
  };
  const retained = contents.split(/\r?\n/).filter((line) => {
    const key = line.trim().split(/[=\s]/, 1)[0];
    return key !== "org.gradle.java.home" && !(key in overrides);
  });
  return `${retained.join("\n").trim()}\n${Object.entries(overrides).map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
}
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";


export async function prepareGradleHome(root: string, jvmArgs = defaultGradleJvmArgs) {
  await mkdir(root, { recursive: true });
  const properties = path.join(/* turbopackIgnore: true */ root, "gradle.properties");
  const existing = await readFile(properties, "utf8").catch(() => "");
  // User-home properties also cover Flutter's included Gradle plugin build.
  await writeFile(properties, androidBuildProperties(existing, jvmArgs), { mode: 0o600 });
}
