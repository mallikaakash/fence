import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { startGatewayServer } from "./http.ts";
import { SPIKE_ALLOWED_MARKET_ID } from "../chain/network.ts";

describe("GET /v1/sessions/:id/readiness", () => {
  let server: Server;
  let port: number;
  let ownerKey: string;
  let dataDir: string;
  let stop: () => Promise<void>;

  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "igw-ready-"));
    process.env.INTENTGUARD_DATA_DIR = dataDir;
    process.env.INTENTGUARD_OWNER_API_KEY = "own_readiness_test";
    process.env.INTENTGUARD_PORT = "0";
    process.env.INTENTGUARD_BIND = "127.0.0.1";
    const started = startGatewayServer();
    server = started.server;
    stop = started.shutdown;
    ownerKey = started.config.ownerApiKey;
    await new Promise<void>((resolve, reject) => {
      server.once("listening", () => resolve());
      server.once("error", reject);
    });
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    port = addr.port;
  });

  after(async () => {
    await stop();
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.INTENTGUARD_DATA_DIR;
    delete process.env.INTENTGUARD_OWNER_API_KEY;
    delete process.env.INTENTGUARD_PORT;
  });

  it("requires owner auth and returns structured payload", async () => {
    const base = `http://127.0.0.1:${port}`;
    const noAuth = await fetch(`${base}/v1/sessions/sess_x/readiness`);
    assert.equal(noAuth.status, 401);

    const create = await fetch(`${base}/v1/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ownerKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        policy: {
          version: 1,
          marketIds: [SPIKE_ALLOWED_MARKET_ID],
          maxMarginPerOrder: "10",
          maxOrderNotional: "100",
          maxLeverage: 3,
          dailyMarginBudget: "500",
        },
        ownerInjectiveAddress: "inj1yrvztj7g3x3009uhm03hgsp3fru6e4mdv7jpkz",
        subaccountIndex: 1,
      }),
    });
    const created = (await create.json()) as { session: { sessionId: string } };
    const sid = created.session.sessionId;

    const readiness = await fetch(`${base}/v1/sessions/${sid}/readiness`, {
      headers: { authorization: `Bearer ${ownerKey}` },
    });
    const body = (await readiness.json()) as {
      overallStatus: string;
      checks: Record<string, { status: string }>;
      granteePrivateKeyHex?: string;
      agentApiToken?: string;
    };
    assert.equal(readiness.status, 200);
    assert.ok(["ready", "action_required", "unavailable"].includes(body.overallStatus));
    assert.ok(body.checks.grants);
    assert.ok(body.checks.granteeGas);
    assert.equal(body.granteePrivateKeyHex, undefined);
    assert.equal(body.agentApiToken, undefined);

    const revoke = await fetch(`${base}/v1/sessions/${sid}/revoke`, {
      method: "POST",
      headers: { authorization: `Bearer ${ownerKey}` },
    });
    assert.equal(revoke.status, 200);
    const afterRevoke = await fetch(`${base}/v1/sessions/${sid}/readiness`, {
      headers: { authorization: `Bearer ${ownerKey}` },
    });
    assert.equal(afterRevoke.status, 410);
  });

  it("rejects mainnet query flag", async () => {
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
          marketIds: [SPIKE_ALLOWED_MARKET_ID],
          maxMarginPerOrder: "10",
          maxOrderNotional: "100",
          maxLeverage: 3,
          dailyMarginBudget: "500",
        },
        ownerInjectiveAddress: "inj1yrvztj7g3x3009uhm03hgsp3fru6e4mdv7jpkz",
        subaccountIndex: 1,
      }),
    });
    const created = (await create.json()) as { session: { sessionId: string } };
    const res = await fetch(
      `${base}/v1/sessions/${created.session.sessionId}/readiness?mainnet=1`,
      { headers: { authorization: `Bearer ${ownerKey}` } },
    );
    assert.equal(res.status, 400);
  });
});
