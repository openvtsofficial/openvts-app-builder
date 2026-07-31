import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecret, encryptSecret } from "../../src/lib/secrets";

test("encrypts signing credentials with authenticated encryption", () => {
  const first = encryptSecret("correct horse battery staple");
  const second = encryptSecret("correct horse battery staple");
  assert.notEqual(first, second);
  assert.equal(decryptSecret(first), "correct horse battery staple");
  const tampered = `${first.slice(0, -1)}${first.endsWith("A") ? "B" : "A"}`;
  assert.throws(() => decryptSecret(tampered));
});
