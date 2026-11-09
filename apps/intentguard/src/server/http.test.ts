import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startGatewayServer } from "./http.ts";
import type { Server } from "node:http";

describe("gateway HTTP", () => {
  let server: Server;
  let port: number;
  let ownerKey: string;
  let dataDir: string;

  before(() => {
    dataDir = mkdtempSync(join(tmpdir(), "igw-"));
    process.env.INTENTGUARD_DATA_DIR = dataDir;
    process.env.INTENTGUARD_OWNER_API_KEY = "own_test_key";
    process.env.INTENTGUARD_PORT = "0";
    const started = startGatewayServer();
    server = started.server;
    ownerKey = started.config.ownerApiKey;
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    port = addr.port;
  });

  after(() => {
    server.close();
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.INTENTGUARD_DATA_DIR;
    delete process.env.INTENTGUARD_OWNER_API_KEY;
    delete process.env.INTENTGUARD_PORT;
  });

  it("creates session and denies oversize propose", async () => {
    const base = `http://127.0.0.1:${port}`;
    const create = await fetch(`${base}/v1/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ownerKey}`,
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
    const created = (await create.json()) as {
      agentApiToken: string;
      session: { sessionId: string };
    };
    assert.equal(create.status, 201);
    assert.ok(created.agentApiToken.startsWith("agt_"));

    const deny = await fetch(`${base}/v1/propose`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${created.agentApiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        intent: {
          marketId: "0xmarket",
          margin: "5",
          leverage: 2,
          price: "100",
          quantity: "1",
        },
      }),
    });
    const denied = (await deny.json()) as { status: string };
    assert.equal(denied.status, "denied");

    const revoke = await fetch(
      `${base}/v1/sessions/${created.session.sessionId}/revoke`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${ownerKey}` },
      },
    );
    assert.equal(revoke.status, 200);
  });
});
