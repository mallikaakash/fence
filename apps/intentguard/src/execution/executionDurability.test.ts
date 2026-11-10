import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IntentGuardGateway } from "../gateway/session.ts";
import { ExecutionSafetyStore } from "./executionSafetyStore.ts";
import { orchestrateAgentExecute } from "./executeOrchestrator.ts";
import { AsyncLock } from "./asyncLock.ts";
import { SessionExecutionGuard } from "./sessionExecutionGuard.ts";
import type { IntentGuardPolicy, TradeIntent } from "../policy/types.ts";
import { SPIKE_ALLOWED_MARKET_ID } from "../chain/network.ts";
import { recoverExecutionSafetyOnStartup } from "./executionRecovery.ts";
import type { ExecuteIdempotencyRecord, TradeProposal } from "./types.ts";
import {
  executeRequestFingerprint,
  hashIdempotencyKey,
  tradeIntentFingerprint,
} from "./fingerprints.ts";

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

function setup() {
  const gateway = new IntentGuardGateway();
  const safety = new ExecutionSafetyStore();
  const lock = new AsyncLock();
  const sessionGuard = new SessionExecutionGuard();
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
  return { gateway, safety, agent, session, proposal, lock, sessionGuard };
}

describe("execution durability", () => {
  it("persistNow invoked before broadcast", async () => {
    const { gateway, safety, agent, proposal, session, lock, sessionGuard } = setup();
    const phases: string[] = [];
    let broadcastStarted = false;
    const idemHash = hashIdempotencyKey(session.sessionId, "dur-1");
    const out = await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "dur-1",
      proposalId: proposal.proposalId,
      intent,
      deps: {
        gateway,
        safety,
        audit: gateway.audit,
        lock,
        sessionGuard,
        config: {
          executeEnabled: true,
          requireOnChainGrant: false,
          network: "testnet",
        },
        persistNow: async () => {
          phases.push(
            safety.getIdempotency(session.sessionId, idemHash)?.state ?? "no-idem",
          );
          const p = safety.getProposal(proposal.proposalId);
          if (p) phases.push(`proposal:${p.status}`);
        },
        runChainExecute: (async () => {
          broadcastStarted = true;
          return {
            status: "allowed" as const,
            stage: "broadcast" as const,
            reasons: [],
            signed: true,
            broadcast: true,
            txHash: "0xabc",
            sessionId: session.sessionId,
          };
        }) as unknown as NonNullable<
          Parameters<typeof orchestrateAgentExecute>[0]["deps"]["runChainExecute"]
        >,
      },
    });
    assert.equal(out.httpStatus, 200);
    assert.ok(broadcastStarted);
    assert.ok(phases.includes("processing") || phases.includes("proposal:consuming"));
    assert.ok(phases.some((p) => p.includes("broadcast_pending")));
  });

  it("persist failure before broadcast prevents runChainExecute", async () => {
    const { gateway, safety, agent, proposal, lock } = setup();
    let calls = 0;
    const out = await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "persist-fail",
      proposalId: proposal.proposalId,
      intent,
      deps: {
        gateway,
        safety,
        audit: gateway.audit,
        lock,
        config: {
          executeEnabled: true,
          requireOnChainGrant: false,
          network: "testnet",
        },
        persistNow: async () => {
          if (safety.getProposal(proposal.proposalId)?.status === "broadcast_pending") {
            throw new Error("disk full");
          }
        },
        runChainExecute: (async () => {
          calls++;
          return {
            status: "allowed" as const,
            stage: "broadcast" as const,
            reasons: [],
            signed: true,
            broadcast: true,
            txHash: "0x1",
          };
        }) as unknown as NonNullable<
          Parameters<typeof orchestrateAgentExecute>[0]["deps"]["runChainExecute"]
        >,
      },
    });
    assert.equal(calls, 0);
    assert.equal(out.httpStatus, 503);
    assert.equal(safety.getProposal(proposal.proposalId)?.status, "broadcast_unknown");
  });

  it("policy fingerprint stale rejects execute", async () => {
    const { gateway, safety, agent, proposal, session } = setup();
    gateway.getSessionRecord(session.sessionId)!.policy.maxMarginPerOrder = "1";
    const out = await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "stale",
      proposalId: proposal.proposalId,
      intent,
      deps: {
        gateway,
        safety,
        audit: gateway.audit,
        config: { executeEnabled: true, requireOnChainGrant: false, network: "testnet" },
      },
    });
    assert.equal(out.httpStatus, 409);
    assert.equal(out.body.errorCode, "policy_fingerprint_stale");
    assert.equal(safety.getProposal(proposal.proposalId)?.status, "approved");
  });

  it("revocation before broadcast fails closed", async () => {
    const { gateway, safety, agent, proposal, session, lock, sessionGuard } = setup();
    const out = await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "revoke-pre",
      proposalId: proposal.proposalId,
      intent,
      deps: {
        gateway,
        safety,
        audit: gateway.audit,
        lock,
        sessionGuard,
        config: { executeEnabled: true, requireOnChainGrant: false, network: "testnet" },
        runChainExecute: async (p) => {
          gateway.revoke(session.sessionId);
          return {
            status: "denied" as const,
            stage: "policy" as const,
            reasons: ["revoked"],
            signed: false,
            broadcast: false,
          };
        },
      },
    });
    assert.equal(out.body.executionState, "failed_before_broadcast");
  });

  it("broadcast_unknown idempotency replays without rebroadcast", async () => {
    const { gateway, safety, agent, proposal, session, lock } = setup();
    const idemRaw = "unknown-key";
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
        gateway,
        safety,
        audit: gateway.audit,
        lock,
        config: { executeEnabled: true, requireOnChainGrant: false, network: "testnet" },
        runChainExecute: (async () => {
          calls++;
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
  });
});

describe("execution recovery", () => {
  it("consuming + processing recovers to approved", () => {
    const gateway = new IntentGuardGateway();
    const safety = new ExecutionSafetyStore();
    const { agent } = gateway.createSession({
      policy,
      granteePrivateKeyHex: "b".repeat(64),
      subaccountId: "0x1",
    });
    const session = gateway.getSessionForAgent(agent.apiToken)!;
    const proposal = safety.createApprovedProposal({
      sessionId: session.sessionId,
      agentApiToken: agent.apiToken,
      policy,
      intent,
      subaccountId: "0x1",
    });
    proposal.status = "consuming";
    const record: ExecuteIdempotencyRecord = {
      idempotencyKeyHash: "h1",
      sessionId: session.sessionId,
      requestFingerprint: "fp",
      proposalId: proposal.proposalId,
      state: "processing",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    safety.importState({ proposals: [proposal], executeIdempotency: [record] });
    recoverExecutionSafetyOnStartup(safety, gateway.audit);
    assert.equal(safety.getProposal(proposal.proposalId)?.status, "approved");
    assert.equal(safety.getIdempotency(session.sessionId, "h1")?.state, "failed_before_broadcast");
  });

  it("broadcast_pending never auto-released", () => {
    const gateway = new IntentGuardGateway();
    const safety = new ExecutionSafetyStore();
    const proposal: TradeProposal = {
      proposalId: "prp_test",
      sessionId: "sess_x",
      agentTokenFingerprint: "fp",
      status: "broadcast_pending",
      intentFingerprint: "if",
      policyFingerprint: "pf",
      intent,
      subaccountId: "0x1",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const record: ExecuteIdempotencyRecord = {
      idempotencyKeyHash: "h2",
      sessionId: "sess_x",
      requestFingerprint: "rf",
      proposalId: "prp_test",
      state: "broadcast_pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    safety.importState({ proposals: [proposal], executeIdempotency: [record] });
    recoverExecutionSafetyOnStartup(safety, gateway.audit);
    assert.equal(safety.getProposal("prp_test")?.status, "broadcast_unknown");
    assert.equal(safety.getIdempotency("sess_x", "h2")?.state, "broadcast_unknown");
  });
});
