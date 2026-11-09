import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startGatewayServer } from "./http.ts";
import type { Server } from "node:http";
import { buildOpenApiDocument } from "./openapi.ts";
import { idempotencyClear } from "./idempotency.ts";

describe("agent HTTP", () => {
  let server: Server;
  let port: number;
  let ownerKey: string;
  let dataDir: string;
  let stop: () => Promise<void>;
  let agentToken: string;

  before(async () => {
    idempotencyClear();
    dataDir = mkdtempSync(join(tmpdir(), "ig-agent-"));
    process.env.INTENTGUARD_DATA_DIR = dataDir;
    process.env.INTENTGUARD_OWNER_API_KEY = "own_agent_test";
    process.env.INTENTGUARD_PORT = "0";
    process.env.INTENTGUARD_BIND = "127.0.0.1";
    const started = startGatewayServer();
    server = started.server;
    stop = started.shutdown;
    ownerKey = started.config.ownerApiKey;
    await new Promise<void>((r) => server.once("listening", () => r()));
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    port = addr.port;

    const create = await fetch(`http://127.0.0.1:${port}/v1/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ownerKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ownerInjectiveAddress: "inj1yrvztj7g3x3009uhm03hgsp3fru6e4mdv7jpkz",
        subaccountIndex: 1,
        policy: {
          version: 1,
          marketIds: ["0xmarket"],
          maxMarginPerOrder: "100",
          maxOrderNotional: "10",
          maxLeverage: 3,
          dailyMarginBudget: "500",
        },
      }),
    });
    const created = (await create.json()) as { agentApiToken: string };
    agentToken = created.agentApiToken;
  });

  after(async () => {
    await stop();
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.INTENTGUARD_DATA_DIR;
    delete process.env.INTENTGUARD_OWNER_API_KEY;
    delete process.env.INTENTGUARD_PORT;
    idempotencyClear();
  });

  it("OpenAPI includes ProposeResponse schema", () => {
    const doc = buildOpenApiDocument() as {
      components: { schemas: Record<string, unknown> };
    };
    assert.ok(doc.components.schemas.ProposeResponse);
    assert.ok(doc.components.schemas.TradeIntent);
  });

  it("propose returns policy_check envelope", async () => {
    const base = `http://127.0.0.1:${port}`;
    const res = await fetch(`${base}/v1/propose`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${agentToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        intent: {
          marketId: "0xmarket",
          margin: "1",
          leverage: 1,
          price: "1",
          quantity: "1",
        },
      }),
    });
    const body = (await res.json()) as {
      phase: string;
      broadcast: boolean;
      dryRun: boolean;
    };
    assert.equal(body.phase, "policy_check");
    assert.equal(body.broadcast, false);
    assert.equal(body.dryRun, true);
  });

  it("replays propose with Idempotency-Key", async () => {
    const base = `http://127.0.0.1:${port}`;
    const headers = {
      authorization: `Bearer ${agentToken}`,
      "content-type": "application/json",
      "idempotency-key": "test-order-001",
    };
    const payload = {
      intent: {
        marketId: "0xmarket",
        margin: "5",
        leverage: 2,
        price: "100",
        quantity: "1",
      },
    };
    const a = await fetch(`${base}/v1/propose`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const b = await fetch(`${base}/v1/propose`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const ja = (await a.json()) as { status: string; idempotentReplay?: boolean };
    const jb = (await b.json()) as { status: string; idempotentReplay?: boolean };
    assert.equal(ja.status, "denied");
    assert.equal(jb.status, "denied");
    assert.equal(jb.idempotentReplay, true);
  });
});
