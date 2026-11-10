import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { startGatewayServer } from "./http.ts";
import { SPIKE_ALLOWED_MARKET_ID } from "../chain/network.ts";

describe("GET /v1/sessions/:id/exposure", () => {
  let port: number;
  let ownerKey: string;
  let dataDir: string;
  let stop: () => Promise<void>;
  let server: Server;

  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "igw-exposure-"));
    process.env.INTENTGUARD_DATA_DIR = dataDir;
    process.env.INTENTGUARD_OWNER_API_KEY = "own_exposure_test";
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
  });

  after(async () => {
    await stop();
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.INTENTGUARD_DATA_DIR;
    delete process.env.INTENTGUARD_OWNER_API_KEY;
    delete process.env.INTENTGUARD_PORT;
  });

  it("auth, rejects subaccount query param, no secrets", async () => {
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${base}/v1/sessions/x/exposure`)).status, 401);

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
    const { session: { sessionId: sid } } = (await create.json()) as {
      session: { sessionId: string };
    };

    const badSub = await fetch(
      `${base}/v1/sessions/${sid}/exposure?subaccountId=0xevil`,
      { headers: { authorization: `Bearer ${ownerKey}` } },
    );
    assert.equal(badSub.status, 400);

    const res = await fetch(`${base}/v1/sessions/${sid}/exposure`, {
      headers: { authorization: `Bearer ${ownerKey}` },
    });
    const body = (await res.json()) as {
      overallStatus: string;
      granteePrivateKeyHex?: string;
    };
    assert.equal(res.status, 200);
    assert.ok(["available", "partial", "unavailable"].includes(body.overallStatus));
    assert.equal(body.granteePrivateKeyHex, undefined);
  });

  it("revoked session → 410, mainnet query → 400", async () => {
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
    const { session: { sessionId: sid } } = (await create.json()) as {
      session: { sessionId: string };
    };

    const mainnet = await fetch(`${base}/v1/sessions/${sid}/exposure?mainnet=1`, {
      headers: { authorization: `Bearer ${ownerKey}` },
    });
    assert.equal(mainnet.status, 400);

    const revoke = await fetch(`${base}/v1/sessions/${sid}/revoke`, {
      method: "POST",
      headers: { authorization: `Bearer ${ownerKey}` },
    });
    assert.equal(revoke.status, 200);

    const gone = await fetch(`${base}/v1/sessions/${sid}/exposure`, {
      headers: { authorization: `Bearer ${ownerKey}` },
    });
    assert.equal(gone.status, 410);
  });
});
