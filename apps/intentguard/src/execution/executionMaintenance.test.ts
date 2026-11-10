import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { IntentGuardGateway } from "../gateway/session.ts";
import { ExecutionSafetyStore } from "./executionSafetyStore.ts";
import { orchestrateAgentExecute } from "./executeOrchestrator.ts";
import { AsyncLock } from "./asyncLock.ts";
import type { IntentGuardPolicy, TradeIntent } from "../policy/types.ts";
import { SPIKE_ALLOWED_MARKET_ID } from "../chain/network.ts";
import { startGatewayServer } from "../server/http.ts";
import { idempotencyClear } from "../server/idempotency.ts";
import {
  executeRequestFingerprint,
  hashIdempotencyKey,
  tradeIntentFingerprint,
} from "./fingerprints.ts";
import type { TradeProposal } from "./types.ts";
import type { ExecuteIdempotencyRecord } from "./types.ts";
import { isExecutionMaintenanceEnabled } from "./executionMaintenance.ts";

const policy: IntentGuardPolicy = {
  version: 1,
  marketIds: [SPIKE_ALLOWED_MARKET_ID],
  maxMarginPerOrder: "50",
  maxOrderNotional: "500",
  maxLeverage: 5,
  dailyMarginBudget: "500",
};

const intent: TradeIntent = {
  marketId: SPIKE_ALLOWED_MARKET_ID,
  margin: "5",
  leverage: 2,
  price: "10",
  quantity: "1",
  side: "buy",
};

function setupOrchestrator() {
  const gateway = new IntentGuardGateway();
  const safety = new ExecutionSafetyStore();
  const lock = new AsyncLock();
  const { agent } = gateway.createSession({
    policy,
    granteePrivateKeyHex: "a".repeat(64),
    granteeAddress: "inj1grantee",
    ownerInjectiveAddress: "inj1yrvztj7g3x3009uhm03hgsp3fru6e4mdv7jpkz",
    subaccountId:
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890000001",
    subaccountIndex: 1,
  });
  const session = gateway.getSessionForAgent(agent.apiToken)!;
  const proposal = safety.createApprovedProposal({
    sessionId: session.sessionId,
    agentApiToken: agent.apiToken,
    policy,
    intent,
    subaccountId: session.subaccountId!,
  });
  return { gateway, safety, agent, session, proposal, lock };
}

const baseDeps = (gateway: IntentGuardGateway, safety: ExecutionSafetyStore, lock: AsyncLock, extra?: object) => ({
  gateway,
  safety,
  audit: gateway.audit,
  lock,
  config: {
    executeEnabled: true,
    requireOnChainGrant: false,
    network: "testnet" as const,
    executionMaintenance: false,
  },
  ...extra,
});

describe("executionMaintenance", () => {
  it("defaults to disabled when env unset", () => {
    const prev = process.env.INTENTGUARD_EXECUTION_MAINTENANCE;
    delete process.env.INTENTGUARD_EXECUTION_MAINTENANCE;
    assert.equal(isExecutionMaintenanceEnabled(), false);
    process.env.INTENTGUARD_EXECUTION_MAINTENANCE = "true";
    assert.equal(isExecutionMaintenanceEnabled(), true);
    if (prev === undefined) delete process.env.INTENTGUARD_EXECUTION_MAINTENANCE;
    else process.env.INTENTGUARD_EXECUTION_MAINTENANCE = prev;
  });

  it("rejects execute before proposal claim — proposal stays approved", async () => {
    const { gateway, safety, agent, proposal, lock } = setupOrchestrator();
    const out = await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "maint-pre-claim",
      proposalId: proposal.proposalId,
      intent,
      deps: {
        ...baseDeps(gateway, safety, lock),
        config: {
          executeEnabled: true,
          requireOnChainGrant: false,
          network: "testnet",
          executionMaintenance: true,
        },
      },
    });
    assert.equal(out.httpStatus, 503);
    assert.equal(out.body.errorCode, "execution_maintenance");
    const fresh = safety.getProposal(proposal.proposalId)!;
    assert.equal(fresh.status, "approved");
    const idemHash = hashIdempotencyKey(fresh.sessionId, "maint-pre-claim");
    assert.equal(safety.getIdempotency(fresh.sessionId, idemHash), undefined);
    const events = gateway.audit.list().filter((e) => e.type === "execute_maintenance_rejected");
    assert.equal(events.length, 1);
  });

  it("does not create idempotency processing record on early reject", async () => {
    const { gateway, safety, agent, proposal, lock } = setupOrchestrator();
    await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "maint-no-idem",
      proposalId: proposal.proposalId,
      intent,
      deps: {
        ...baseDeps(gateway, safety, lock),
        config: {
          executeEnabled: true,
          requireOnChainGrant: false,
          network: "testnet",
          executionMaintenance: true,
        },
      },
    });
    assert.equal(safety.listIdempotencyForProposal(proposal.proposalId).length, 0);
  });

  it("maintenance after claim blocks at pre-broadcast gate", async () => {
    const { gateway, safety, agent, proposal, lock } = setupOrchestrator();
    let probeCalls = 0;
    let runChain = 0;
    const out = await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "maint-mid",
      proposalId: proposal.proposalId,
      intent,
      deps: {
        ...baseDeps(gateway, safety, lock, {
          executionMaintenanceProbe: () => {
            probeCalls += 1;
            return probeCalls >= 2;
          },
          runChainExecute: (async () => {
            runChain += 1;
            return {
              status: "allowed" as const,
              stage: "broadcast" as const,
              reasons: [],
              signed: true,
              broadcast: true,
              txHash: "0xabc",
            };
          }) as unknown as NonNullable<
            Parameters<typeof orchestrateAgentExecute>[0]["deps"]["runChainExecute"]
          >,
        }),
      },
    });
    assert.equal(out.httpStatus, 503);
    assert.equal(out.body.errorCode, "execution_maintenance");
    assert.equal(out.body.executionState, "failed_before_broadcast");
    assert.equal(runChain, 0);
    const fresh = safety.getProposal(proposal.proposalId)!;
    assert.equal(fresh.status, "approved");
  });

  it("maintenance after broadcast_pending does not abort in-flight broadcast", async () => {
    const { gateway, safety, agent, proposal, lock } = setupOrchestrator();
    const session = gateway.getSessionForAgent(agent.apiToken)!;
    const idemHash = hashIdempotencyKey(session.sessionId, "maint-post-broadcast-pending");
    let releaseBroadcast: () => void = () => {};
    const holdBroadcast = new Promise<void>((r) => {
      releaseBroadcast = r;
    });
    let runChain = 0;
    const execPromise = orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "maint-post-broadcast-pending",
      proposalId: proposal.proposalId,
      intent,
      deps: {
        ...baseDeps(gateway, safety, lock, {
          executionMaintenanceProbe: () => runChain > 0,
          runChainExecute: (async () => {
            runChain += 1;
            await holdBroadcast;
            return {
              status: "allowed" as const,
              stage: "broadcast" as const,
              reasons: [],
              signed: true,
              broadcast: true,
              txHash: "0xdead",
            };
          }) as unknown as NonNullable<
            Parameters<typeof orchestrateAgentExecute>[0]["deps"]["runChainExecute"]
          >,
        }),
      },
    });
    for (let i = 0; i < 100; i++) {
      const idem = safety.getIdempotency(session.sessionId, idemHash);
      if (idem?.state === "broadcast_pending" && runChain === 1) break;
      await new Promise((r) => setTimeout(r, 2));
    }
    assert.equal(safety.getIdempotency(session.sessionId, idemHash)?.state, "broadcast_pending");
    assert.equal(runChain, 1);
    releaseBroadcast();
    const out = await execPromise;
    assert.equal(out.httpStatus, 200);
    const body = out.body as { txHash?: string };
    assert.equal(body.txHash, "0xdead");
  });

  it("broadcast_unknown idempotency replay still works under maintenance", async () => {
    const { gateway, safety, agent, proposal, lock } = setupOrchestrator();
    const session = gateway.getSessionForAgent(agent.apiToken)!;
    const idemRaw = "maint-replay";
    const idemHash = hashIdempotencyKey(session.sessionId, idemRaw);
    const intentFp = tradeIntentFingerprint(intent, {
      sessionId: session.sessionId,
      subaccountId: session.subaccountId!,
      orderType: "derivative_limit",
    });
    const rf = executeRequestFingerprint({
      proposalId: proposal.proposalId,
      intentFingerprint: intentFp,
    });
    const record: ExecuteIdempotencyRecord = {
      idempotencyKeyHash: idemHash,
      sessionId: session.sessionId,
      requestFingerprint: rf,
      proposalId: proposal.proposalId,
      state: "broadcast_unknown",
      result: { errorCode: "broadcast_unknown", executionState: "broadcast_unknown" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const p: TradeProposal = {
      ...proposal,
      status: "broadcast_unknown",
      consumedByIdempotencyKeyHash: idemHash,
    };
    safety.importState({ proposals: [p], executeIdempotency: [record] });
    let calls = 0;
    const out = await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: idemRaw,
      proposalId: proposal.proposalId,
      intent,
      deps: {
        ...baseDeps(gateway, safety, lock),
        config: {
          executeEnabled: true,
          requireOnChainGrant: false,
          network: "testnet",
          executionMaintenance: true,
        },
        runChainExecute: (async () => {
          calls += 1;
          return {
            status: "allowed" as const,
            stage: "broadcast" as const,
            reasons: [],
            signed: true,
            broadcast: true,
            txHash: "0x",
          };
        }) as unknown as NonNullable<
          Parameters<typeof orchestrateAgentExecute>[0]["deps"]["runChainExecute"]
        >,
      },
    });
    assert.equal(calls, 0);
    assert.equal(out.body.idempotentReplay, true);
    assert.equal(out.body.errorCode, "broadcast_unknown");
  });
});

describe("executionMaintenance HTTP", () => {
  let server: Server;
  let port: number;
  let ownerKey: string;
  let dataDir: string;
  let stop: () => Promise<void>;
  let agentToken: string;
  let sessionId: string;

  before(async () => {
    idempotencyClear();
    dataDir = mkdtempSync(join(tmpdir(), "ig-maint-"));
    process.env.INTENTGUARD_DATA_DIR = dataDir;
    process.env.INTENTGUARD_OWNER_API_KEY = "own_maint_test";
    process.env.INTENTGUARD_PORT = "0";
    process.env.INTENTGUARD_BIND = "127.0.0.1";
    process.env.INTENTGUARD_EXECUTION_MAINTENANCE = "1";
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
          marketIds: [SPIKE_ALLOWED_MARKET_ID],
          maxMarginPerOrder: "100",
          maxOrderNotional: "10",
          maxLeverage: 3,
          dailyMarginBudget: "500",
        },
      }),
    });
    const created = (await create.json()) as {
      agentApiToken: string;
      session: { sessionId: string };
    };
    agentToken = created.agentApiToken;
    sessionId = created.session.sessionId;
  });

  after(async () => {
    await stop();
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.INTENTGUARD_DATA_DIR;
    delete process.env.INTENTGUARD_OWNER_API_KEY;
    delete process.env.INTENTGUARD_PORT;
    delete process.env.INTENTGUARD_EXECUTION_MAINTENANCE;
    idempotencyClear();
  });

  it("GET /health reports executionMaintenance", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = (await res.json()) as { executionMaintenance: boolean };
    assert.equal(body.executionMaintenance, true);
  });

  it("read-only agent session and propose still work", async () => {
    const base = `http://127.0.0.1:${port}`;
    const sess = await fetch(`${base}/v1/agent/session`, {
      headers: { authorization: `Bearer ${agentToken}` },
    });
    assert.equal(sess.status, 200);
    const propose = await fetch(`${base}/v1/propose`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${agentToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        intent: {
          marketId: SPIKE_ALLOWED_MARKET_ID,
          margin: "1",
          leverage: 1,
          price: "1",
          quantity: "1",
        },
      }),
    });
    assert.equal(propose.status, 200);
  });

  it("POST /v1/execute returns execution_maintenance", async () => {
    const base = `http://127.0.0.1:${port}`;
    const propose = await fetch(`${base}/v1/propose`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${agentToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        intent: {
          marketId: SPIKE_ALLOWED_MARKET_ID,
          margin: "1",
          leverage: 1,
          price: "1",
          quantity: "1",
        },
      }),
    });
    const { proposalId } = (await propose.json()) as { proposalId: string };
    const exec = await fetch(`${base}/v1/execute`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${agentToken}`,
        "content-type": "application/json",
        "idempotency-key": "http-maint",
      },
      body: JSON.stringify({
        proposalId,
        intent: {
          marketId: SPIKE_ALLOWED_MARKET_ID,
          margin: "1",
          leverage: 1,
          price: "1",
          quantity: "1",
        },
      }),
    });
    assert.equal(exec.status, 503);
    const body = (await exec.json()) as { errorCode: string };
    assert.equal(body.errorCode, "execution_maintenance");
  });

  it("POST revoke still works during maintenance", async () => {
    const base = `http://127.0.0.1:${port}`;
    const res = await fetch(`${base}/v1/sessions/${sessionId}/revoke`, {
      method: "POST",
      headers: { authorization: `Bearer ${ownerKey}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { revoked: boolean };
    assert.equal(body.revoked, true);
  });
});
