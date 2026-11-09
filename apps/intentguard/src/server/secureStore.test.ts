import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { SecureFileStore } from "./secureStore.ts";
import type { GatewaySession } from "../gateway/session.ts";

const sampleSession = (): GatewaySession => ({
  sessionId: "sess_test",
  agentApiToken: "agt_test",
  granteeAddress: "inj1abc",
  granteePrivateKeyHex: "b".repeat(64),
  policy: {
    version: 1,
    marketIds: ["0xm"],
    maxMarginPerOrder: "10",
    maxLeverage: 2,
    dailyMarginBudget: "100",
  },
  dailyMarginUsed: "0",
  revoked: false,
  createdAt: new Date().toISOString(),
});

describe("SecureFileStore", () => {
  it("encrypts grantee key at rest when data key set", () => {
    const dir = mkdtempSync(join(tmpdir(), "ig-sec-"));
    const key = randomBytes(32);
    const store = new SecureFileStore(dir, key);
    store.save([sampleSession()], []);
    const loaded = store.load();
    assert.equal(loaded.sessions[0]?.granteePrivateKeyHex, "b".repeat(64));
    const raw = JSON.parse(readFileSync(join(dir, "state.json"), "utf8")) as {
      sessions: Array<{ granteePrivateKeyEnc?: string; granteePrivateKeyHex?: string }>;
    };
    assert.ok(raw.sessions[0]?.granteePrivateKeyEnc);
    assert.equal(raw.sessions[0]?.granteePrivateKeyHex, undefined);
    rmSync(dir, { recursive: true, force: true });
  });
});
