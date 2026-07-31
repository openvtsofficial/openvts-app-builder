import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { materializeFlutterProject, zipDirectory } from "../../src/lib/flutter-template";
import type { StudioProject } from "../../src/lib/types";

const project: StudioProject = {
  id: "test-project",
  name: "Northstar Fleet",
  slug: "northstar-fleet",
  androidApplicationName: "Northstar Android",
  iosApplicationName: "Northstar iOS",
  androidPackageName: "com.northstar.fleet",
  iosBundleId: "io.northstar.fleet-ios",
  apiBaseUrl: "https://fleet.northstar.io/api",
  accentColor: "#2847C7",
  templateVersion: "1.0.0",
  configurationRevision: 1,
  status: "READY",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

test("materializes a safe cross-platform Flutter source tree", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "studio-template-test-"));
  try {
    const output = path.join(root, "app");
    const icons = await readFile("tests/fixtures/icon-kitchen-sample.zip");
    const result = await materializeFlutterProject({ project, templateRoot: path.resolve("templates/flutter_base"), outputRoot: output, iconArchive: icons });
    assert.ok(result.iconAssetsInstalled > 40);

    // Android: package name replaced in build.gradle.kts
    const gradle = await readFile(path.join(output, "android/app/build.gradle.kts"), "utf8");
    assert.match(gradle, /namespace = "com\.northstar\.fleet"/);
    assert.match(gradle, /applicationId = "com\.northstar\.fleet"/);
    assert.doesNotMatch(gradle, /com\.openvts\.app/);

    // Android: MainActivity.kt relocated to new package directory
    const activity = await readFile(path.join(output, "android/app/src/main/kotlin/com/northstar/fleet/MainActivity.kt"), "utf8");
    assert.match(activity, /^package com\.northstar\.fleet/m);

    // Android: app label updated in AndroidManifest.xml
    const manifest = await readFile(path.join(output, "android/app/src/main/AndroidManifest.xml"), "utf8");
    assert.match(manifest, /android:label="Northstar Android"/);
    assert.doesNotMatch(manifest, /Open VTS/);

    // iOS: bundle identifier updated in .pbxproj
    const pbxproj = await readFile(path.join(output, "ios/Runner.xcodeproj/project.pbxproj"), "utf8");
    assert.match(pbxproj, /PRODUCT_BUNDLE_IDENTIFIER = io\.northstar\.fleet-ios;/);
    assert.doesNotMatch(pbxproj, /com\.openvts\.app;/);

    // iOS: display name updated in Info.plist
    const plist = await readFile(path.join(output, "ios/Runner/Info.plist"), "utf8");
    assert.match(plist, /<string>Northstar iOS<\/string>/);
    assert.doesNotMatch(plist, /<string>Open VTS<\/string>/);

    // Branding assets written
    assert.ok((await stat(path.join(output, "assets/brand/logo.png"))).size > 500);
    assert.ok((await stat(path.join(output, "assets/brand/dark-logo.png"))).size > 500);

    // Icon Kitchen icons installed to correct locations
    assert.ok((await stat(path.join(output, "ios/Runner/Assets.xcassets/AppIcon.appiconset/AppIcon~ios-marketing.png"))).size > 50_000);
    assert.ok((await stat(path.join(output, "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"))).size > 5_000);

    // API base URL replaced in app_config.dart
    const appConfig = await readFile(path.join(output, "lib/core/config/app_config.dart"), "utf8");
    assert.match(appConfig, /https:\/\/fleet\.northstar\.io\/api/);
    assert.doesNotMatch(appConfig, /https:\/\/app\.openvts\.io\/api/);

    // Application name replaced in app_config.dart and app_constants.dart
    assert.match(appConfig, /appName = 'Northstar Android'/);
    assert.doesNotMatch(appConfig, /appName = 'OpenVTS'/);
    const appConstants = await readFile(path.join(output, "lib/core/config/app_constants.dart"), "utf8");
    assert.match(appConstants, /appName = 'Northstar Android'/);

    // .env file contains the configured API URL
    const envFile = await readFile(path.join(output, ".env"), "utf8");
    assert.match(envFile, /API_BASE_URL=https:\/\/fleet\.northstar\.io\/api/);

    // No leftover base values
    const pubspec = await readFile(path.join(output, "pubspec.yaml"), "utf8");
    assert.doesNotMatch(pubspec, /^name:\s*open_vts$/m);

    // Zip works
    const archive = await zipDirectory(output);
    assert.ok(archive.length > 500_000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
