import assert from "node:assert/strict";
import test from "node:test";
import { currentBuildFor, latestSuccessfulBuild } from "../../src/lib/build-freshness";
import type { StudioBuild } from "../../src/lib/types";

const builds: StudioBuild[] = [
  { id: "old", projectId: "project", projectRevision: 1, type: "DEBUG_APK", status: "SUCCEEDED", progress: 100, currentStage: "Ready", createdAt: "2026-07-13T10:00:00.000Z", finishedAt: "2026-07-13T10:05:00.000Z" },
  { id: "current", projectId: "project", projectRevision: 2, type: "DEBUG_APK", status: "SUCCEEDED", progress: 100, currentStage: "Ready", createdAt: "2026-07-14T10:00:00.000Z", finishedAt: "2026-07-14T10:05:00.000Z" },
];

test("selects only a successful artifact for the exact saved revision", () => {
  assert.equal(currentBuildFor(builds, "DEBUG_APK", 2, false)?.id, "current");
  assert.equal(currentBuildFor(builds, "DEBUG_APK", 3, false), undefined);
  assert.equal(currentBuildFor(builds, "DEBUG_APK", 2, true), undefined);
});

test("returns the latest successful artifact for a resource type", () => {
  assert.equal(latestSuccessfulBuild(builds, "DEBUG_APK")?.id, "current");
  assert.equal(latestSuccessfulBuild(builds, "SOURCE_ZIP"), undefined);
});
