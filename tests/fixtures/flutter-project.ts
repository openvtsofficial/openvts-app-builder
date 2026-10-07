import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Minimal upstream contract for offline tests, never a runtime template.
export async function createFlutterFixture(root: string) {
  const files: Record<string, string> = {
    "pubspec.yaml": "name: open_vts\nversion: 0.1.2+3\n",
    "android/gradle.properties": "org.gradle.jvmargs=-Xmx8G -XX:MaxMetaspaceSize=4G\norg.gradle.java.home=C:\\local\\jdk\nandroid.useAndroidX=true\n",
    "android/app/build.gradle.kts": `plugins {
    id("com.android.application")
}
android {
    namespace = "com.openvts.app"
    defaultConfig {
        applicationId = "com.openvts.app"
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}
`,
    "android/app/src/main/kotlin/com/openvts/app/MainActivity.kt": "package com.openvts.app\n",
    "android/app/src/main/AndroidManifest.xml": '<manifest><application android:label="Open VTS" /></manifest>',
    "ios/Runner.xcodeproj/project.pbxproj": "PRODUCT_BUNDLE_IDENTIFIER = com.openvts.app;\nPRODUCT_BUNDLE_IDENTIFIER = com.openvts.app.RunnerTests;\n",
    "ios/Runner/Info.plist": "<plist><string>Open VTS</string></plist>",
    "lib/core/config/app_config.dart": "const appName = 'OpenVTS';\nconst apiBaseUrl = 'https://app.openvts.io/api';\n",
    "lib/core/config/app_constants.dart": "const appName = 'OpenVTS';\n",
    "android/gradlew": "#!/bin/sh\n",
  };
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
}
