import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IntentGuardGateway } from "../gateway/session.ts";
import { ExecutionSafetyStore } from "./executionSafetyStore.ts";
import { orchestrateAgentExecute } from "./executeOrchestrator.ts";
type MockExec = NonNullable<
  Parameters<typeof orchestrateAgentExecute>[0]["deps"]["runChainExecute"]
>;
import { AsyncLock } from "./asyncLock.ts";
import type { IntentGuardPolicy, TradeIntent } from "../policy/types.ts";
import { SPIKE_ALLOWED_MARKET_ID } from "../chain/network.ts";

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

describe("executeOrchestrator", () => {
  it("requires Idempotency-Key", async () => {
    const { gateway, safety, agent, proposal } = setup();
    const out = await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: undefined,
      proposalId: proposal.proposalId,
      intent,
      deps: {
        gateway,
        safety,
        audit: gateway.audit,
        config: {
          executeEnabled: true,
          requireOnChainGrant: false,
          network: "testnet",
        },
      },
    });
    assert.equal(out.httpStatus, 400);
    assert.equal(out.body.errorCode, "idempotency_key_required");
  });

  it("rejects intent mismatch", async () => {
    const { gateway, safety, agent, proposal } = setup();
    const out = await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "key-1",
      proposalId: proposal.proposalId,
      intent: { ...intent, quantity: "99" },
      deps: {
        gateway,
        safety,
        audit: gateway.audit,
        config: {
          executeEnabled: true,
          requireOnChainGrant: false,
          network: "testnet",
        },
      },
    });
    assert.equal(out.httpStatus, 409);
    assert.equal(out.body.errorCode, "intent_mismatch");
  });

  it("mock broadcast + idempotent replay", async () => {
    const { gateway, safety, agent, proposal, lock } = setup();
    let calls = 0;
    const deps = {
      gateway,
      safety,
      audit: gateway.audit,
      config: {
        executeEnabled: true,
        requireOnChainGrant: false,
        network: "testnet" as const,
      },
      lock,
      runChainExecute: (async () => {
        calls++;
        return {
          status: "allowed" as const,
          stage: "broadcast" as const,
          reasons: [],
          signed: true,
          broadcast: true,
          txHash: "0xabc",
          sessionId: gateway.getSessionForAgent(agent.apiToken)!.sessionId,
        };
      }) as unknown as MockExec,
    };
    const a = await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "exec-once",
      proposalId: proposal.proposalId,
      intent,
      deps,
    });
    assert.equal(a.httpStatus, 200);
    assert.equal(a.body.broadcast, true);
    assert.equal(calls, 1);

    const b = await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "exec-once",
      proposalId: proposal.proposalId,
      intent,
      deps,
    });
    assert.equal(b.httpStatus, 200);
    assert.equal(b.body.idempotentReplay, true);
    assert.equal(calls, 1);
  });

  it("second idempotency key cannot consume same proposal", async () => {
    const { gateway, safety, agent, proposal, lock } = setup();
    const deps = {
      gateway,
      safety,
      audit: gateway.audit,
      config: {
        executeEnabled: true,
        requireOnChainGrant: false,
        network: "testnet" as const,
      },
      lock,
      runChainExecute: (async () => ({
        status: "allowed" as const,
        stage: "broadcast" as const,
        reasons: [],
        signed: true,
        broadcast: true,
        txHash: "0x1",
        sessionId: gateway.getSessionForAgent(agent.apiToken)!.sessionId,
      })) as unknown as MockExec,
    };
    await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "k1",
      proposalId: proposal.proposalId,
      intent,
      deps,
    });
    const second = await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "k2",
      proposalId: proposal.proposalId,
      intent,
      deps,
    });
    assert.equal(second.httpStatus, 409);
    assert.equal(second.body.errorCode, "proposal_consumed");
  });

  it("idempotency payload conflict", async () => {
    const { gateway, safety, agent, proposal } = setup();
    const deps = {
      gateway,
      safety,
      audit: gateway.audit,
      config: {
        executeEnabled: true,
        requireOnChainGrant: false,
        network: "testnet" as const,
      },
      runChainExecute: (async () => ({
        status: "denied" as const,
        stage: "broadcast" as const,
        reasons: ["mock fail"],
        signed: false,
        broadcast: false,
      })) as unknown as MockExec,
    };
    const p2 = safety.createApprovedProposal({
      sessionId: gateway.getSessionForAgent(agent.apiToken)!.sessionId,
      agentApiToken: agent.apiToken,
      policy,
      intent: { ...intent, margin: "6" },
      subaccountId: gateway.getSessionForAgent(agent.apiToken)!.subaccountId!,
    });
    await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "same-key",
      proposalId: proposal.proposalId,
      intent,
      deps,
    });
    const conflict = await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "same-key",
      proposalId: p2.proposalId,
      intent: { ...intent, margin: "6" },
      deps,
    });
    assert.equal(conflict.httpStatus, 409);
    assert.equal(conflict.body.errorCode, "idempotency_payload_conflict");
  });

  it("policy re-deny releases proposal", async () => {
    const { gateway, safety, agent, proposal, session } = setup();
    const rec = gateway.getSessionRecord(session.sessionId)!;
    rec.dailyMarginUsed = "496";
    rec.dailyMarginDay = new Date().toISOString().slice(0, 10);
    const out = await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "rel",
      proposalId: proposal.proposalId,
      intent,
      deps: {
        gateway,
        safety,
        audit: gateway.audit,
        config: {
          executeEnabled: true,
          requireOnChainGrant: false,
          network: "testnet",
        },
        runChainExecute: (async () => ({
          status: "allowed" as const,
          stage: "broadcast" as const,
          reasons: [],
          signed: true,
          broadcast: true,
          txHash: "0x",
        })) as unknown as MockExec,
      },
    });
    assert.equal(out.body.errorCode, "policy_denied");
    assert.equal(safety.getProposal(proposal.proposalId)?.status, "approved");
  });

  it("expired proposal rejected", async () => {
    const { gateway, safety, agent } = setup();
    const proposal = safety.createApprovedProposal({
      sessionId: gateway.getSessionForAgent(agent.apiToken)!.sessionId,
      agentApiToken: agent.apiToken,
      policy,
      intent,
      subaccountId: gateway.getSessionForAgent(agent.apiToken)!.subaccountId!,
      nowMs: Date.now() - 400_000,
    });
    const p = safety.getProposal(proposal.proposalId)!;
    p.expiresAt = new Date(Date.now() - 1000).toISOString();
    safety.importState({ proposals: [p], executeIdempotency: [] });
    const out = await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "exp",
      proposalId: proposal.proposalId,
      intent,
      deps: {
        gateway,
        safety,
        audit: gateway.audit,
        config: {
          executeEnabled: true,
          requireOnChainGrant: false,
          network: "testnet",
        },
      },
    });
    assert.equal(out.httpStatus, 410);
    assert.equal(out.body.errorCode, "proposal_expired");
  });

  it("blocks broadcast when execute readiness gate fails", async () => {
    const { gateway, safety, agent, proposal, lock } = setup();
    const out = await orchestrateAgentExecute({
      agentApiToken: agent.apiToken,
      idempotencyKeyRaw: "readiness-gate",
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
          requireExecuteReadiness: true,
          network: "testnet",
        },
        executeReadinessGate: async () => ({
          ok: false,
          errorCode: "execute_readiness_not_ready",
          message: "Subaccount needs USDC",
          overallStatus: "action_required",
          blockers: ["subaccountCollateral: needs USDC"],
        }),
        runChainExecute: (async () => ({
          status: "allowed" as const,
          stage: "broadcast" as const,
          reasons: [],
          signed: true,
          broadcast: true,
          txHash: "0x",
        })) as unknown as MockExec,
      },
    });
    assert.equal(out.httpStatus, 403);
    assert.equal(out.body.errorCode, "execute_readiness_not_ready");
  });
});
