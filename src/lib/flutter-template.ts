import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { canonicalIconPath, recognizedIconPrefixes } from "@/lib/icon-kitchen";
import type { StudioProject } from "@/lib/types";
import { androidPackageRegex, iosBundleRegex } from "@/lib/validation";

const BASE_PACKAGE = "com.openvts.app";
const BASE_APP_LABEL = "Open VTS";
const BASE_APP_NAME = "OpenVTS";
const BASE_API_URL = "https://app.openvts.io/api";
const BASE_PUBSPEC_NAME = "open_vts";

const textExtensions = new Set([".dart", ".yaml", ".yml", ".xml", ".plist", ".kt", ".kts", ".gradle", ".json", ".html", ".md", ".pbxproj", ".xcconfig", ".properties", ".arb"]);

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function assertSafeProject(project: StudioProject) {
  if (!androidPackageRegex.test(project.androidPackageName)) throw new Error("Invalid Android package name");
  if (!iosBundleRegex.test(project.iosBundleId)) throw new Error("Invalid iOS bundle identifier");
  if (!/^#[0-9A-Fa-f]{6}$/.test(project.accentColor)) throw new Error("Invalid accent color");
}

function pubspecName(packageName: string) {
  return packageName.split(".").pop()?.replace(/-/g, "_") ?? "app";
}

async function walk(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(root, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  }));
  return files.flat();
}

async function replaceInTextFiles(root: string, project: StudioProject) {
  const newPubspecName = pubspecName(project.androidPackageName);
  const userAppName = project.androidApplicationName;

  for (const file of await walk(root)) {
    const ext = path.extname(file);
    const basename = path.basename(file);
    if (!textExtensions.has(ext) && basename !== "Podfile") continue;

    let contents = await readFile(file, "utf8");
    const original = contents;

    // .pbxproj: replace bundle identifiers (iOS uses different ID than Android)
    if (ext === ".pbxproj") {
      contents = contents.replace(
        /PRODUCT_BUNDLE_IDENTIFIER = com\.openvts\.app\.RunnerTests;/g,
        `PRODUCT_BUNDLE_IDENTIFIER = ${project.iosBundleId}.RunnerTests;`
      );
      contents = contents.replace(
        /PRODUCT_BUNDLE_IDENTIFIER = com\.openvts\.app;/g,
        `PRODUCT_BUNDLE_IDENTIFIER = ${project.iosBundleId};`
      );
    } else {
      // All other files: replace Android package name
      contents = contents.replaceAll(BASE_PACKAGE, project.androidPackageName);
    }

    // Replace dart package name in imports (package:open_vts/ → package:new_name/)
    if (ext === ".dart") {
      contents = contents.replaceAll(`package:${BASE_PUBSPEC_NAME}/`, `package:${newPubspecName}/`);
    }

    // Replace app label in AndroidManifest.xml
    if (basename === "AndroidManifest.xml") {
      contents = contents.replace(
        `android:label="${BASE_APP_LABEL}"`,
        `android:label="${escapeXml(project.androidApplicationName)}"`
      );
    }

    // Replace iOS display name in Info.plist
    if (basename === "Info.plist") {
      contents = contents.replaceAll(
        `<string>${BASE_APP_LABEL}</string>`,
        `<string>${escapeXml(project.iosApplicationName)}</string>`
      );
    }

    // Replace pubspec name
    if (basename === "pubspec.yaml") {
      contents = contents.replace(
        /^name:\s*open_vts$/m,
        `name: ${newPubspecName}`
      );
    }

    // Replace accent color in colors.xml
    if (basename === "colors.xml" && contents.includes("notification_accent")) {
      const hex = project.accentColor.slice(1).toUpperCase();
      contents = contents.replace(
        /(<color name="notification_accent">)#[0-9A-Fa-f]{6,8}(<\/color>)/,
        `$1#FF${hex}$2`
      );
    }

    // Replace API base URL in config and .env files
    contents = contents.replaceAll(BASE_API_URL, project.apiBaseUrl);

    // Replace application name references ("OpenVTS" and "Open VTS") with user's app name
    contents = contents.replaceAll(BASE_APP_NAME, userAppName);
    contents = contents.replaceAll(BASE_APP_LABEL, userAppName);

    if (contents !== original) {
      await writeFile(file, contents, "utf8");
    }
  }
}

async function relocateMainActivity(outputRoot: string, packageName: string) {
  const kotlinRoot = path.join(outputRoot, "android", "app", "src", "main", "kotlin");
  const oldPath = path.join(kotlinRoot, ...BASE_PACKAGE.split("."));
  const newPath = path.join(kotlinRoot, ...packageName.split("."));

  if (oldPath === newPath) return;

  const mainActivityFile = path.join(oldPath, "MainActivity.kt");
  const mainActivityExists = await stat(mainActivityFile).then(() => true).catch(() => false);

  if (mainActivityExists) {
    let content = await readFile(mainActivityFile, "utf8");
    content = content.replace(`package ${BASE_PACKAGE}`, `package ${packageName}`);
    await mkdir(newPath, { recursive: true });
    await writeFile(path.join(newPath, "MainActivity.kt"), content, "utf8");
    await rm(oldPath, { recursive: true, force: true });

    // Clean up empty parent directories from the old package path
    const oldParts = BASE_PACKAGE.split(".");
    for (let i = oldParts.length - 1; i >= 0; i--) {
      const parent = path.join(kotlinRoot, ...oldParts.slice(0, i + 1));
      const entries = await readdir(parent).catch(() => null);
      if (entries && entries.length === 0) {
        await rm(parent, { recursive: true, force: true });
      } else break;
    }
  }
}

function decodeDataUrl(value?: string) {
  if (!value) return undefined;
  const match = value.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/s);
  if (!match) return undefined;
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 2_000_000) throw new Error("Logo exceeds the 2 MB limit");
  return buffer;
}

async function defaultLogo(project: StudioProject) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${project.accentColor}"/><path d="M132 174h248M176 256h160M220 338h72" fill="none" stroke="white" stroke-width="42" stroke-linecap="round"/><circle cx="132" cy="174" r="24" fill="white"/><circle cx="380" cy="174" r="24" fill="white"/></svg>`;
  return Buffer.from(svg);
}

async function writeBrandingAssets(outputRoot: string, project: StudioProject) {
  const brandRoot = path.join(outputRoot, "assets", "brand");
  await mkdir(brandRoot, { recursive: true });
  const fallback = await defaultLogo(project);
  const light = decodeDataUrl(project.logoLightUrl) ?? fallback;
  const dark = decodeDataUrl(project.logoDarkUrl) ?? light;
  await Promise.all([
    sharp(light, { limitInputPixels: 16_777_216 }).resize(512, 512, { fit: "inside", withoutEnlargement: true }).png().toFile(path.join(brandRoot, "logo.png")),
    sharp(dark, { limitInputPixels: 16_777_216 }).resize(512, 512, { fit: "inside", withoutEnlargement: true }).png().toFile(path.join(brandRoot, "dark-logo.png")),
    sharp(light, { limitInputPixels: 16_777_216 }).resize(192, 192, { fit: "inside", withoutEnlargement: true }).png().toFile(path.join(brandRoot, "icon.png")),
    sharp(dark, { limitInputPixels: 16_777_216 }).resize(192, 192, { fit: "inside", withoutEnlargement: true }).png().toFile(path.join(brandRoot, "dark-icon.png")),
  ]);
}

function safeRelativeIconPath(value: string) {
  const normalized = canonicalIconPath(value);
  if (!recognizedIconPrefixes.some((prefix) => normalized.toLowerCase().startsWith(prefix))) return undefined;
  if (normalized.includes("..") || path.isAbsolute(normalized)) return undefined;
  return normalized;
}

export async function installIconKitchenArchive(outputRoot: string, archive?: Buffer) {
  if (!archive) return { installed: 0 };
  if (archive.length > 20_000_000) throw new Error("Icon archive exceeds the 20 MB limit");
  const zip = await JSZip.loadAsync(archive, { checkCRC32: true });
  let installed = 0;
  for (const [originalPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const canonical = safeRelativeIconPath(originalPath);
    if (!canonical) continue;
    let destination: string | undefined;
    if (canonical.toLowerCase().startsWith("android/res/")) destination = path.join(outputRoot, "android", "app", "src", "main", "res", canonical.slice("android/res/".length));
    else if (canonical.toLowerCase().startsWith("android/") && canonical.toLowerCase().endsWith("play_store_512.png")) destination = path.join(outputRoot, "android", "app", "src", "main", "res", "mipmap-xxxhdpi", "play_store_512.png");
    else if (canonical.toLowerCase().startsWith("ios/")) destination = path.join(outputRoot, "ios", "Runner", "Assets.xcassets", "AppIcon.appiconset", canonical.slice("ios/".length));
    else if (canonical.toLowerCase() === "web/favicon.ico") destination = path.join(outputRoot, "web", "favicon.ico");
    else if (canonical.toLowerCase() === "web/icon-192.png") destination = path.join(outputRoot, "web", "icons", "Icon-192.png");
    else if (canonical.toLowerCase() === "web/icon-512.png") destination = path.join(outputRoot, "web", "icons", "Icon-512.png");
    else if (canonical.toLowerCase() === "web/icon-192-maskable.png") destination = path.join(outputRoot, "web", "icons", "Icon-maskable-192.png");
    else if (canonical.toLowerCase() === "web/icon-512-maskable.png") destination = path.join(outputRoot, "web", "icons", "Icon-maskable-512.png");
    if (!destination) continue;
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await entry.async("nodebuffer"));
    installed += 1;
  }
  return { installed };
}

async function configureSigningBuildGradle(outputRoot: string) {
  const gradlePath = path.join(outputRoot, "android", "app", "build.gradle.kts");
  let content = await readFile(gradlePath, "utf8");

  if (content.includes("key.properties")) return;

  const importAndProperties = `import java.util.Properties

val keystorePropertiesFile = rootProject.file("app/key.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(keystorePropertiesFile.inputStream())
}

`;

  // Insert the import + properties before plugins block
  content = importAndProperties + content;

  // Add signingConfigs inside the android block, and update buildTypes
  content = content.replace(
    /(\bdefaultConfig\s*\{[\s\S]*?\n\s*\})/,
    `$1

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }`
  );

  content = content.replace(
    /signingConfig\s*=\s*signingConfigs\.getByName\("debug"\)/,
    `signingConfig = if (keystorePropertiesFile.exists()) signingConfigs.getByName("release") else signingConfigs.getByName("debug")`
  );

  await writeFile(gradlePath, content, "utf8");
}

export async function materializeFlutterProject({ project, templateRoot, outputRoot, iconArchive }: { project: StudioProject; templateRoot: string; outputRoot: string; iconArchive?: Buffer }) {
  assertSafeProject(project);
  await mkdir(outputRoot, { recursive: true });

  // Step 1: Copy the entire base project from template
  await cp(templateRoot, outputRoot, { recursive: true, force: true });

  // Remove build/ directory if it was included in the template
  await rm(path.join(outputRoot, "build"), { recursive: true, force: true });

  // Step 2: Replace hardcoded values with user's configuration
  await replaceInTextFiles(outputRoot, project);

  // Step 3: Relocate MainActivity.kt to the new package directory
  await relocateMainActivity(outputRoot, project.androidPackageName);

  // Step 4: Write branding assets (logos resized to proper locations)
  await writeBrandingAssets(outputRoot, project);

  // Step 5: Install Icon Kitchen icons (replaces launcher icons)
  const icons = await installIconKitchenArchive(outputRoot, iconArchive);

  // Step 6: Configure signing in build.gradle.kts if key.properties will be present
  await configureSigningBuildGradle(outputRoot);

  // Step 7: Create .env file with the configured API base URL
  const envPath = path.join(outputRoot, ".env");
  await writeFile(envPath, `# Runtime environment\nAPI_BASE_URL=${project.apiBaseUrl}\n`, "utf8");

  // Step 8: Write manifest for traceability
  await writeFile(path.join(outputRoot, "studio-manifest.json"), JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    templateVersion: project.templateVersion,
    project: {
      name: project.name,
      androidApplicationName: project.androidApplicationName,
      iosApplicationName: project.iosApplicationName,
      androidPackageName: project.androidPackageName,
      iosBundleId: project.iosBundleId,
      apiBaseUrl: project.apiBaseUrl,
      accentColor: project.accentColor,
    },
    iconAssetsInstalled: icons.installed,
  }, null, 2));

  return { outputRoot, iconAssetsInstalled: icons.installed };
}

export async function zipDirectory(root: string) {
  const zip = new JSZip();
  for (const absolute of await walk(root)) {
    const info = await stat(absolute);
    if (info.size > 15_000_000) continue;
    const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
    if (relative.startsWith("build/") || relative.startsWith(".dart_tool/")) continue;
    zip.file(relative, await readFile(absolute));
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
