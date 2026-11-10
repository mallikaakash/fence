import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startGatewayServer } from "../server/http.ts";
import type { Server } from "node:http";

describe("state write freeze HTTP", () => {
  let dataDir: string;
  let server: Server;
  let port: number;
  let ownerKey: string;
  let shutdown: () => Promise<void>;

  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "ig-swf-http-"));
    process.env.INTENTGUARD_DATA_DIR = dataDir;
    process.env.INTENTGUARD_OWNER_API_KEY = "own_test_freeze";
    process.env.INTENTGUARD_PORT = "0";
    process.env.INTENTGUARD_WRITER_LEASE_MODE = "none";
    delete process.env.INTENTGUARD_STATE_WRITE_FREEZE;
    const started = startGatewayServer();
    server = started.server;
    ownerKey = process.env.INTENTGUARD_OWNER_API_KEY;
    shutdown = started.shutdown;
    await started.startupReady;
    await new Promise<void>((r) => server.once("listening", () => r()));
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    port = addr.port;
  });

  after(async () => {
    await shutdown();
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.INTENTGUARD_DATA_DIR;
    delete process.env.INTENTGUARD_OWNER_API_KEY;
    delete process.env.INTENTGUARD_PORT;
    delete process.env.INTENTGUARD_WRITER_LEASE_MODE;
  });

  it("GET /health exposes stateWriteFreeze and status", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = (await res.json()) as {
      stateWriteFreeze?: boolean;
      stateWriteStatus?: { frozen: boolean };
    };
    assert.equal(typeof body.stateWriteFreeze, "boolean");
    assert.equal(body.stateWriteStatus?.frozen, false);
  });

  it("owner freeze rejects session create; agent cannot freeze", async () => {
    const freeze = await fetch(`http://127.0.0.1:${port}/v1/owner/state-write/freeze`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ownerKey}` },
    });
    assert.equal(freeze.status, 200);

    const agentFreeze = await fetch(`http://127.0.0.1:${port}/v1/owner/state-write/freeze`, {
      method: "POST",
      headers: { Authorization: "Bearer agt_notanowner" },
    });
    assert.equal(agentFreeze.status, 401);

    const session = await fetch(`http://127.0.0.1:${port}/v1/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ policy: { version: 1, marketIds: ["0xmarket"] } }),
    });
    assert.equal(session.status, 503);
    const body = (await session.json()) as { errorCode?: string };
    assert.equal(body.errorCode, "state_write_frozen");

    const unfreeze = await fetch(`http://127.0.0.1:${port}/v1/owner/state-write/unfreeze`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ownerKey}` },
    });
    assert.equal(unfreeze.status, 200);
  });
});
