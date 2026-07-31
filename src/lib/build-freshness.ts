import type { BuildType, StudioBuild } from "@/lib/types";

const terminalStatuses = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

export function isBuildRunning(build?: StudioBuild) {
  return Boolean(build && !terminalStatuses.has(build.status));
}

export function latestSuccessfulBuild(builds: StudioBuild[], type: BuildType) {
  return builds
    .filter((build) => build.type === type && build.status === "SUCCEEDED")
    .sort((left, right) => new Date(right.finishedAt || right.createdAt).getTime() - new Date(left.finishedAt || left.createdAt).getTime())[0];
}

export function currentBuildFor(builds: StudioBuild[], type: BuildType, projectRevision: number, hasUnsavedChanges: boolean) {
  if (hasUnsavedChanges) return undefined;
  const latest = latestSuccessfulBuild(builds, type);
  return latest?.projectRevision === projectRevision ? latest : undefined;
}
