import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { startGatewayServer } from "./http.ts";
import type { Server } from "node:http";

describe("gateway security", () => {
  let server: Server;
  let port: number;
  let dataDir: string;

  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "ig-sec-http-"));
    process.env.INTENTGUARD_DATA_DIR = dataDir;
    process.env.INTENTGUARD_OWNER_API_KEY = "own_sec_test_key_1234567890";
    process.env.INTENTGUARD_DATA_KEY = randomBytes(32).toString("hex");
    process.env.INTENTGUARD_PORT = "0";
    process.env.INTENTGUARD_BIND = "127.0.0.1";
    const started = startGatewayServer();
    server = started.server;
    await new Promise<void>((r) => server.once("listening", () => r()));
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    port = addr.port;
  });

  after(() => {
    server.close();
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.INTENTGUARD_DATA_DIR;
    delete process.env.INTENTGUARD_OWNER_API_KEY;
    delete process.env.INTENTGUARD_DATA_KEY;
    delete process.env.INTENTGUARD_PORT;
    delete process.env.INTENTGUARD_BIND;
  });

  it("rejects grants/plan without owner key", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/grants/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        policy: { version: 1, marketIds: ["0x"], maxMarginPerOrder: "1", maxLeverage: 1, dailyMarginBudget: "1" },
        granteeAddress: "inj1abc",
        subaccountId: "0xsub",
      }),
    });
    assert.equal(res.status, 401);
  });

  it("rejects wrong owner key (timing-safe path)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/sessions`, {
      method: "POST",
      headers: {
        authorization: "Bearer own_wrong_key_1234567890",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        policy: {
          version: 1,
          marketIds: ["0xmarket"],
          maxMarginPerOrder: "100",
          maxOrderNotional: "10",
          maxLeverage: 3,
          dailyMarginBudget: "500",
        },
        ownerInjectiveAddress: "inj1yrvztj7g3x3009uhm03hgsp3fru6e4mdv7jpkz",
        subaccountIndex: 1,
      }),
    });
    assert.equal(res.status, 401);
  });
});
