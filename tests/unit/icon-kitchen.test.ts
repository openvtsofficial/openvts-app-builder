import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectIconKitchenPaths, inspectIconKitchenZip } from "../../src/lib/icon-kitchen";

test("recognizes the supplied Icon Kitchen archive", async () => {
  const archive = await readFile("tests/fixtures/icon-kitchen-sample.zip");
  const { manifest } = await inspectIconKitchenZip(archive);
  assert.equal(manifest.valid, true);
  assert.deepEqual(manifest.platforms, { android: true, ios: true, web: true });
  assert.equal(manifest.fileCount, 51);
  assert.equal(manifest.missing.length, 0);
  assert.equal(manifest.sampleIconPath, "ios/AppIcon~ios-marketing.png");
});

test("normalizes an arbitrary extracted root folder", () => {
  const manifest = inspectIconKitchenPaths([
    "download/icons/android/res/mipmap-mdpi/ic_launcher.png",
    "download/icons/android/res/mipmap-hdpi/ic_launcher.png",
    "download/icons/android/res/mipmap-xhdpi/ic_launcher.png",
    "download/icons/android/res/mipmap-xxhdpi/ic_launcher.png",
    "download/icons/android/res/mipmap-xxxhdpi/ic_launcher.png",
    "download/icons/ios/Contents.json",
    "download/icons/ios/AppIcon~ios-marketing.png",
  ]);
  assert.equal(manifest.valid, true);
});
