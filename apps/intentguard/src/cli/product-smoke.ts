#!/usr/bin/env node
/**
 * Release smoke: gateway health → session → propose deny → list sessions.
 * No chain keys required.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startGatewayServer } from "../server/http.ts";

const dataDir = mkdtempSync(join(tmpdir(), "ig-product-"));
process.env.INTENTGUARD_DATA_DIR = dataDir;
process.env.INTENTGUARD_OWNER_API_KEY = "own_smoke";
process.env.INTENTGUARD_PORT = "0";

const { server, config } = startGatewayServer();
await new Promise<void>((r) => setTimeout(r, 80));
const addr = server.address();
assert.ok(addr && typeof addr === "object");
const base = `http://127.0.0.1:${addr.port}`;

const health = await fetch(`${base}/health`);
assert.equal(health.status, 200);
const h = (await health.json()) as { ok: boolean; version: string };
assert.equal(h.ok, true);

const create = await fetch(`${base}/v1/sessions`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${config.ownerApiKey}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    ownerInjectiveAddress: "inj1yrvztj7g3x3009uhm03hgsp3fru6e4mdv7jpkz",
    subaccountIndex: 1,
    policy: {
      version: 1,
      marketIds: ["0xdc70164d7120529c3cd84278c98df4151210c0447a65a2aab03459cf328de41e"],
      maxMarginPerOrder: "100",
      maxOrderNotional: "10",
      maxLeverage: 3,
      dailyMarginBudget: "500",
    },
  }),
});
assert.equal(create.status, 201);
const created = (await create.json()) as {
  agentApiToken: string;
  grantPlan: { typedGrants: unknown[] };
};
assert.ok(created.grantPlan.typedGrants.length > 0);

const deny = await fetch(`${base}/v1/propose`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${created.agentApiToken}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    intent: {
      marketId: "0xdc70164d7120529c3cd84278c98df4151210c0447a65a2aab03459cf328de41e",
      margin: "5",
      leverage: 2,
      price: "100",
      quantity: "1",
    },
  }),
});
const denied = (await deny.json()) as { status: string };
assert.equal(denied.status, "denied");

const execOff = await fetch(`${base}/v1/execute`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${created.agentApiToken}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    intent: {
      marketId: "0xdc70164d7120529c3cd84278c98df4151210c0447a65a2aab03459cf328de41e",
      margin: "1",
      leverage: 1,
      price: "1",
      quantity: "1",
    },
  }),
});
assert.equal(execOff.status, 503);

const list = await fetch(`${base}/v1/sessions`, {
  headers: { authorization: `Bearer ${config.ownerApiKey}` },
});
assert.equal(list.status, 200);
const listed = (await list.json()) as { sessions: unknown[] };
assert.equal(listed.sessions.length, 1);

console.log("OK product-smoke: gateway session + policy deny + execute gate");

server.close();
rmSync(dataDir, { recursive: true, force: true });
