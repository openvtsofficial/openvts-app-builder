import { readFile } from "node:fs/promises";

export class HostMemoryError extends Error {
  constructor(availableMiB: number, minimumMiB: number) {
    super(`Waiting for server memory: ${Math.floor(availableMiB)} MB available; ${minimumMiB} MB required`);
    this.name = "HostMemoryError";
  }
}

export function availableHostMemoryMiB(meminfo: string) {
  const match = /^MemAvailable:\s+(\d+)\s+kB\s*$/m.exec(meminfo);
  return match ? Number(match[1]) / 1024 : undefined;
}

export async function assertHostMemoryHeadroom(minimumMiB: number, meminfoPath = "/proc/meminfo") {
  if (minimumMiB <= 0) return;
  const available = availableHostMemoryMiB(await readFile(meminfoPath, "utf8"));
  if (available === undefined) throw new Error("Unable to read host available memory; native builds require Linux /proc/meminfo");
  if (available < minimumMiB) throw new HostMemoryError(available, minimumMiB);
}
