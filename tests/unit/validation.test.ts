import assert from "node:assert/strict";
import test from "node:test";
import { androidPackageRegex, iosBundleRegex, projectSchema, slugify } from "../../src/lib/validation";

test("accepts production package identifiers", () => {
  assert.equal(androidPackageRegex.test("com.openvts.mobile_app"), true);
  assert.equal(iosBundleRegex.test("com.openvts.mobile-app"), true);
  assert.equal(androidPackageRegex.test("Com.OpenVTS.App"), false);
  assert.equal(androidPackageRegex.test("openvts"), false);
});

test("validates independent Android and iOS identity", () => {
  const result = projectSchema.safeParse({
    name: "Northstar Fleet",
    description: "Fleet operations application",
    androidApplicationName: "Northstar Android",
    iosApplicationName: "Northstar iOS",
    androidPackageName: "com.northstar.fleet",
    iosBundleId: "io.northstar.fleet-ios",
    accentColor: "#171716",
  });
  assert.equal(result.success, true);
});

test("creates safe project slugs", () => {
  assert.equal(slugify("  Northstar Fleet — Europe  "), "northstar-fleet-europe");
});
