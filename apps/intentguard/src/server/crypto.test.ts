import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, parseDataKey } from "./crypto.ts";

describe("server crypto", () => {
  it("round-trips grantee hex", () => {
    const key = randomBytes(32);
    const hex = "a".repeat(64);
    const sealed = encryptSecret(key, hex);
    assert.notEqual(sealed, hex);
    assert.equal(decryptSecret(key, sealed), hex);
  });

  it("parses 64-char hex data key", () => {
    const hex = randomBytes(32).toString("hex");
    const buf = parseDataKey(hex);
    assert.ok(buf && buf.length === 32);
  });
});
