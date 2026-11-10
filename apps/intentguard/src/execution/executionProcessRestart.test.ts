/**
 * Phase 2A.3.2 — actual second-process restart using shared INTENTGUARD_DATA_DIR + state.json.
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { startGatewayServer } from "../server/http.ts";
import { idempotencyClear } from "../server/idempotency.ts";
import type { PersistedStateV3 } from "../server/secureStore.ts";
import {
  executeRequestFingerprint,
  hashIdempotencyKey,
  tradeIntentFingerprint,
  policyFingerprint,
  agentTokenFingerprint,
} from "./fingerprints.ts";
import type { TradeProposal } from "./types.ts";
const MARKET = "0xmarket";
const intent = {
  marketId: MARKET,
  margin: "5",
  leverage: 2,
  price: "10",
  quantity: "1",
  side: "buy" as const,
};

async function boot(
  dataDir: string,
): Promise<{ server: Server; port: number; shutdown: () => Promise<void> }> {
  process.env.INTENTGUARD_DATA_DIR = dataDir;
  process.env.INTENTGUARD_PORT = "0";
  process.env.INTENTGUARD_BIND = "127.0.0.1";
  process.env.INTENTGUARD_EXECUTE = "0";
  delete process.env.DOCKER;
  const { server, shutdown } = startGatewayServer();
  await new Promise<void>((r) => server.once("listening", () => r()));
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  return { server, port: addr.port, shutdown };
}

describe("process restart (state.json hydrate + recovery)", () => {
  let dataDir: string;
  const envSnapshot = { ...process.env };

  after(() => {
    process.env = { ...envSnapshot };
    idempotencyClear();
  });

  it("after crash with broadcast_pending on disk, restart blocks new idempotency key", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "ig-restart-bp-"));
    const { port, shutdown } = await boot(dataDir);
    const ownerKey = JSON.parse(
      readFileSync(join(dataDir, "config.json"), "utf8"),
    ).ownerApiKey as string;

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
          marketIds: [MARKET],
          maxMarginPerOrder: "50",
          maxOrderNotional: "500",
          maxLeverage: 5,
          dailyMarginBudget: "500",
        },
      }),
    });
    const created = (await create.json()) as {
      agentApiToken: string;
      session: { sessionId: string };
    };
    const sessionId = created.session.sessionId;

    await shutdown();

    const raw = JSON.parse(
      readFileSync(join(dataDir, "state.json"), "utf8"),
    ) as PersistedStateV3;
    const sub = raw.sessions[0]!.subaccountId ?? "0x1";
    const policy = {
      version: 1 as const,
      marketIds: [MARKET],
      maxMarginPerOrder: "50",
      maxOrderNotional: "500",
      maxLeverage: 5,
      dailyMarginBudget: "500",
    };
    const intentFp = tradeIntentFingerprint(intent, {
      sessionId: sessionId,
      subaccountId: sub,
      orderType: "derivative_limit",
    });
    const proposalId = "prp_restart_bp_test";
    const proposal: TradeProposal = {
      proposalId,
      sessionId: sessionId,
      agentTokenFingerprint: agentTokenFingerprint(created.agentApiToken),
      status: "broadcast_pending",
      intentFingerprint: intentFp,
      policyFingerprint: policyFingerprint(policy),
      intent: { ...intent },
      subaccountId: sub,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };
    const idemHash = hashIdempotencyKey(sessionId, "crash-key");
    const rf = executeRequestFingerprint({ proposalId, intentFingerprint: intentFp });
    raw.proposals = [proposal];
    raw.executeIdempotency = [
      {
        idempotencyKeyHash: idemHash,
        sessionId: sessionId,
        requestFingerprint: rf,
        proposalId,
        state: "broadcast_pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    writeFileSync(join(dataDir, "state.json"), JSON.stringify(raw, null, 2));

    const second = await boot(dataDir);
    const other = await fetch(`http://127.0.0.1:${second.port}/v1/execute`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${created.agentApiToken}`,
        "content-type": "application/json",
        "idempotency-key": "other-key",
      },
      body: JSON.stringify({
        proposalId,
        intent,
      }),
    });
    const body = (await other.json()) as { errorCode?: string };
    await second.shutdown();
    rmSync(dataDir, { recursive: true, force: true });

    assert.equal(other.status, 409);
    assert.ok(
      body.errorCode === "proposal_broadcast_unknown" ||
        body.errorCode === "proposal_not_approved",
      `unexpected errorCode: ${body.errorCode}`,
    );
  });

  it("after pre-broadcast consuming crash, restart allows new key but not ambiguous rebroadcast", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "ig-restart-cons-"));
    const { port, shutdown } = await boot(dataDir);
    const ownerKey = JSON.parse(
      readFileSync(join(dataDir, "config.json"), "utf8"),
    ).ownerApiKey as string;

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
          marketIds: [MARKET],
          maxMarginPerOrder: "50",
          maxOrderNotional: "500",
          maxLeverage: 5,
          dailyMarginBudget: "500",
        },
      }),
    });
    const created = (await create.json()) as {
      agentApiToken: string;
      session: { sessionId: string };
    };
    const sessionId = created.session.sessionId;

    await shutdown();

    const raw = JSON.parse(
      readFileSync(join(dataDir, "state.json"), "utf8"),
    ) as PersistedStateV3;
    const sub = raw.sessions[0]!.subaccountId ?? "0x1";
    const policy = {
      version: 1 as const,
      marketIds: [MARKET],
      maxMarginPerOrder: "50",
      maxOrderNotional: "500",
      maxLeverage: 5,
      dailyMarginBudget: "500",
    };
    const proposalId = "prp_restart_consume_test";
    const intentFp = tradeIntentFingerprint(intent, {
      sessionId: sessionId,
      subaccountId: sub,
      orderType: "derivative_limit",
    });
    raw.proposals = [
      {
        proposalId,
        sessionId: sessionId,
        agentTokenFingerprint: agentTokenFingerprint(created.agentApiToken),
        status: "consuming",
        intentFingerprint: intentFp,
        policyFingerprint: policyFingerprint(policy),
        intent: { ...intent },
        subaccountId: sub,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      },
    ];
    raw.executeIdempotency = [
      {
        idempotencyKeyHash: hashIdempotencyKey(sessionId, "old-key"),
        sessionId: sessionId,
        requestFingerprint: "rf",
        proposalId,
        state: "processing",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    writeFileSync(join(dataDir, "state.json"), JSON.stringify(raw, null, 2));

    const second = await boot(dataDir);
    const recovered = JSON.parse(
      readFileSync(join(dataDir, "state.json"), "utf8"),
    ) as PersistedStateV3;
    const p = recovered.proposals!.find((x) => x.proposalId === proposalId)!;
    assert.equal(p.status, "approved");

    const exec = await fetch(`http://127.0.0.1:${second.port}/v1/execute`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${created.agentApiToken}`,
        "content-type": "application/json",
        "idempotency-key": "new-key-after-crash",
      },
      body: JSON.stringify({
        proposalId,
        intent,
      }),
    });
    await second.shutdown();
    rmSync(dataDir, { recursive: true, force: true });

    assert.notEqual(exec.status, 409);
    assert.ok(
      exec.status === 503 || exec.status === 200,
      `execute gated (execute off): ${exec.status}`,
    );
  });
});
