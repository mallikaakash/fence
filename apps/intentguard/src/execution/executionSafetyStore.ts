import { randomBytes } from "node:crypto";
import type { IntentGuardGateway } from "../gateway/session.ts";
import type { IntentGuardPolicy, TradeIntent } from "../policy/types.ts";
import {
  agentTokenFingerprint,
  policyFingerprint,
  tradeIntentFingerprint,
  type IntentBindingContext,
} from "./fingerprints.ts";
import type {
  ExecuteIdempotencyRecord,
  ExecuteIdempotencyState,
  TradeProposal,
  TradeProposalStatus,
} from "./types.ts";
import { proposalTtlMs } from "./config.ts";

function newProposalId(): string {
  return `prp_${randomBytes(10).toString("hex")}`;
}

const NON_EXECUTABLE_PROPOSAL: TradeProposalStatus[] = [
  "consuming",
  "broadcast_pending",
  "broadcast_unknown",
  "broadcasted",
  "confirmed",
  "consumed",
  "expired",
  "denied",
  "failed_before_broadcast",
];

export class ExecutionSafetyStore {
  private proposals = new Map<string, TradeProposal>();
  private idempotency = new Map<string, ExecuteIdempotencyRecord>();

  importState(params: {
    proposals?: TradeProposal[];
    executeIdempotency?: ExecuteIdempotencyRecord[];
  }): void {
    this.proposals.clear();
    this.idempotency.clear();
    for (const p of params.proposals ?? []) {
      this.proposals.set(p.proposalId, p);
    }
    for (const r of params.executeIdempotency ?? []) {
      this.idempotency.set(this.idemKey(r.sessionId, r.idempotencyKeyHash), r);
    }
  }

  exportState(): {
    proposals: TradeProposal[];
    executeIdempotency: ExecuteIdempotencyRecord[];
  } {
    return {
      proposals: [...this.proposals.values()],
      executeIdempotency: [...this.idempotency.values()],
    };
  }

  private idemKey(sessionId: string, hash: string): string {
    return `${sessionId}:${hash}`;
  }

  getProposal(proposalId: string): TradeProposal | undefined {
    return this.proposals.get(proposalId);
  }

  replaceProposal(proposal: TradeProposal): void {
    this.proposals.set(proposal.proposalId, proposal);
  }

  getIdempotency(
    sessionId: string,
    idempotencyKeyHash: string,
  ): ExecuteIdempotencyRecord | undefined {
    return this.idempotency.get(this.idemKey(sessionId, idempotencyKeyHash));
  }

  listIdempotencyForProposal(proposalId: string): ExecuteIdempotencyRecord[] {
    return [...this.idempotency.values()].filter((r) => r.proposalId === proposalId);
  }

  upsertIdempotency(record: ExecuteIdempotencyRecord): void {
    this.idempotency.set(
      this.idemKey(record.sessionId, record.idempotencyKeyHash),
      record,
    );
  }

  transitionIdempotency(
    record: ExecuteIdempotencyRecord,
    next: ExecuteIdempotencyState,
    nowIso: string,
  ): void {
    record.executionMeta = {
      ...record.executionMeta,
      lastTransitionAt: nowIso,
      previousState: record.state,
    };
    record.state = next;
    record.updatedAt = nowIso;
    this.upsertIdempotency(record);
  }

  transitionProposalStatus(
    proposalId: string,
    next: TradeProposalStatus,
    nowIso: string,
    extra?: Partial<TradeProposal>,
  ): TradeProposal | undefined {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return undefined;
    proposal.executionMeta = {
      ...proposal.executionMeta,
      lastTransitionAt: nowIso,
      previousState: proposal.status,
    };
    proposal.status = next;
    if (extra) Object.assign(proposal, extra);
    this.proposals.set(proposalId, proposal);
    return proposal;
  }

  createApprovedProposal(params: {
    sessionId: string;
    agentApiToken: string;
    policy: IntentGuardPolicy;
    intent: TradeIntent;
    subaccountId: string;
    nowMs?: number;
  }): TradeProposal {
    const now = params.nowMs ?? Date.now();
    const ttl = proposalTtlMs();
    const ctx: IntentBindingContext = {
      sessionId: params.sessionId,
      subaccountId: params.subaccountId,
      orderType: "derivative_limit",
    };
    const proposal: TradeProposal = {
      proposalId: newProposalId(),
      sessionId: params.sessionId,
      agentTokenFingerprint: agentTokenFingerprint(params.agentApiToken),
      status: "approved",
      intentFingerprint: tradeIntentFingerprint(params.intent, ctx),
      policyFingerprint: policyFingerprint(params.policy),
      intent: { ...params.intent },
      subaccountId: params.subaccountId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttl).toISOString(),
    };
    this.proposals.set(proposal.proposalId, proposal);
    return proposal;
  }

  expireProposalIfNeeded(
    proposal: TradeProposal,
    nowMs: number,
  ): TradeProposal {
    if (proposal.status === "approved" && nowMs >= Date.parse(proposal.expiresAt)) {
      proposal.status = "expired";
      this.proposals.set(proposal.proposalId, proposal);
    }
    return proposal;
  }

  /** In-process only — call inside AsyncLock for proposal id. */
  tryBeginProposalConsume(
    proposalId: string,
    idempotencyKeyHash: string,
  ): { ok: true; proposal: TradeProposal } | { ok: false; reason: string; code: string } {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      return { ok: false, reason: "unknown proposalId", code: "proposal_not_found" };
    }
    if (proposal.status === "consumed" || proposal.status === "confirmed") {
      if (proposal.consumedByIdempotencyKeyHash === idempotencyKeyHash) {
        return { ok: false, reason: "proposal already consumed", code: "proposal_already_consumed" };
      }
      return {
        ok: false,
        reason: "proposal consumed by a different execute request",
        code: "proposal_consumed",
      };
    }
    if (NON_EXECUTABLE_PROPOSAL.includes(proposal.status)) {
      if (proposal.status === "consuming") {
        return { ok: false, reason: "proposal claim in progress", code: "proposal_in_progress" };
      }
      if (proposal.status === "broadcast_unknown") {
        return {
          ok: false,
          reason: "proposal broadcast outcome unknown — operator reconcile required",
          code: "proposal_broadcast_unknown",
        };
      }
      return {
        ok: false,
        reason: `proposal not executable (status=${proposal.status})`,
        code: "proposal_not_approved",
      };
    }
    if (proposal.status === "expired") {
      return { ok: false, reason: "proposal expired", code: "proposal_expired" };
    }
    if (proposal.status === "denied") {
      return { ok: false, reason: "proposal denied", code: "proposal_denied" };
    }
    if (proposal.status !== "approved") {
      return { ok: false, reason: "proposal not executable", code: "proposal_invalid" };
    }
    proposal.status = "consuming";
    proposal.activeIdempotencyKeyHash = idempotencyKeyHash;
    this.proposals.set(proposalId, proposal);
    return { ok: true, proposal };
  }

  finalizeProposalConsume(
    proposalId: string,
    idempotencyKeyHash: string,
    outcome: "consumed" | "release" | "broadcast_unknown" | "failed_before_broadcast",
  ): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return;
    if (outcome === "consumed") {
      proposal.status = "consumed";
      proposal.consumedAt = new Date().toISOString();
      proposal.consumedByIdempotencyKeyHash = idempotencyKeyHash;
      proposal.activeIdempotencyKeyHash = undefined;
    } else if (outcome === "broadcast_unknown") {
      proposal.status = "broadcast_unknown";
      proposal.consumedByIdempotencyKeyHash = idempotencyKeyHash;
      proposal.activeIdempotencyKeyHash = undefined;
    } else if (outcome === "failed_before_broadcast") {
      proposal.status = "failed_before_broadcast";
      proposal.activeIdempotencyKeyHash = undefined;
    } else if (proposal.status === "consuming") {
      proposal.status = "approved";
      proposal.activeIdempotencyKeyHash = undefined;
    }
    this.proposals.set(proposalId, proposal);
  }

  /** Prune stale terminal records before persist (demo scale). */
  pruneOld(olderThanMs: number, nowMs: number = Date.now()): void {
    const cutoff = nowMs - olderThanMs;
    for (const [id, p] of this.proposals) {
      if (
        (p.status === "consumed" ||
          p.status === "confirmed" ||
          p.status === "expired" ||
          p.status === "failed_before_broadcast") &&
        Date.parse(p.createdAt) < cutoff
      ) {
        this.proposals.delete(id);
      }
    }
    for (const [key, r] of this.idempotency) {
      if (
        (r.state === "completed" ||
          r.state === "confirmed" ||
          r.state === "failed_before_broadcast" ||
          r.state === "broadcast_unknown") &&
        Date.parse(r.updatedAt) < cutoff
      ) {
        this.idempotency.delete(key);
      }
    }
  }

  resolveSubaccountId(
    gateway: IntentGuardGateway,
    sessionId: string,
    subaccountId?: string,
  ): string {
    if (subaccountId) return subaccountId;
    const s = gateway.getSessionRecord(sessionId);
    return s?.subaccountId ?? "0x0";
  }
}
