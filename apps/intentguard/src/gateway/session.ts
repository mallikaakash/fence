import { createHash, randomBytes } from "node:crypto";
import { evaluateTradeIntent } from "../policy/evaluate.ts";
import { maybeDispatchWebhook } from "../server/webhooks.ts";
import { explainPolicy } from "../policy/explain.ts";
import type { IntentGuardPolicy, TradeIntent } from "../policy/types.ts";
import { AuditLog } from "./audit.ts";
import { ensureDailyMarginCurrentDay } from "./dailyBudget.ts";
import {
  assertAgentHasNoSigningKey,
  isGranteeMaterialExposedToAgent,
  type AgentCredential,
} from "./keys.ts";

export type GatewaySession = {
  sessionId: string;
  agentApiToken: string;
  /** inj1… once derived; may be placeholder until SDK keygen wired. */
  granteeAddress: string;
  /** Hex key — NEVER returned to agent APIs. */
  granteePrivateKeyHex: string;
  policy: IntentGuardPolicy;
  dailyMarginUsed: string;
  /** UTC day (YYYY-MM-DD) for dailyMarginUsed. */
  dailyMarginDay?: string;
  revoked: boolean;
  createdAt: string;
  /** Owner granter for MsgExec + typed grants. */
  ownerInjectiveAddress?: string;
  subaccountId?: string;
  subaccountIndex?: number;
  /** ISO time after which agent token is rejected. */
  agentTokenExpiresAt?: string;
  /** On-chain MsgGrant expiry (seconds from grant time). Default 24h in planGrant. */
  grantExpirySeconds?: number;
};

export type PublicSessionView = {
  sessionId: string;
  granteeAddress: string;
  ownerInjectiveAddress?: string;
  subaccountId?: string;
  policy: IntentGuardPolicy;
  policyEnglish: string;
  dailyMarginUsed: string;
  revoked: boolean;
  createdAt: string;
};

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function fingerprintKey(hex: string): string {
  return createHash("sha256").update(hex).digest("hex").slice(0, 12);
}

/**
 * In-process IntentGuard gateway.
 * Holds the grantee key; agents only get an API token.
 */
export class IntentGuardGateway {
  readonly audit = new AuditLog();
  private sessions = new Map<string, GatewaySession>();
  private tokenToSession = new Map<string, string>();

  createSession(params: {
    policy: IntentGuardPolicy;
    /** Optional pre-generated key material (tests). */
    granteePrivateKeyHex?: string;
    granteeAddress?: string;
    ownerInjectiveAddress?: string;
    subaccountId?: string;
    subaccountIndex?: number;
    agentTokenTtlMs?: number;
    grantExpirySeconds?: number;
  }): { view: PublicSessionView; agent: AgentCredential } {
    const granteePrivateKeyHex =
      params.granteePrivateKeyHex ?? randomBytes(32).toString("hex");
    const sessionId = newId("sess");
    const agentApiToken = newId("agt");
    const granteeAddress =
      params.granteeAddress ??
      `inj1pending_${fingerprintKey(granteePrivateKeyHex)}`;

    const ttl =
      params.agentTokenTtlMs ??
      Number(process.env.INTENTGUARD_AGENT_TOKEN_TTL_MS ?? 7 * 24 * 60 * 60 * 1000);
    const session: GatewaySession = {
      sessionId,
      agentApiToken,
      granteeAddress,
      granteePrivateKeyHex,
      policy: params.policy,
      dailyMarginUsed: "0",
      revoked: false,
      createdAt: new Date().toISOString(),
      ownerInjectiveAddress: params.ownerInjectiveAddress,
      subaccountId: params.subaccountId,
      subaccountIndex: params.subaccountIndex,
      agentTokenExpiresAt: new Date(Date.now() + ttl).toISOString(),
      grantExpirySeconds: params.grantExpirySeconds,
    };

    this.sessions.set(sessionId, session);
    this.tokenToSession.set(agentApiToken, sessionId);

    this.audit.append("session_created", "Gateway session created", {
      sessionId,
      granteeAddress,
      keyFingerprint: fingerprintKey(granteePrivateKeyHex),
      policyEnglish: explainPolicy(params.policy),
    });

    this.audit.append(
      "key_isolation_ok",
      "Grantee key retained in gateway only",
      { sessionId },
    );

    return {
      view: this.toPublic(session),
      agent: { role: "agent", apiToken: agentApiToken },
    };
  }

  getPublicSession(sessionId: string): PublicSessionView | undefined {
    const s = this.sessions.get(sessionId);
    return s ? this.toPublic(s) : undefined;
  }

  listPublicSessions(): PublicSessionView[] {
    return [...this.sessions.values()].map((s) => this.toPublic(s));
  }

  /** Sidecar execute path only — never expose via agent APIs. */
  getSessionForAgent(agentApiToken: string): GatewaySession | undefined {
    const sessionId = this.tokenToSession.get(agentApiToken);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  recordMarginUse(sessionId: string, margin: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    ensureDailyMarginCurrentDay(session);
    session.dailyMarginUsed = String(
      Number(session.dailyMarginUsed) + Number(margin),
    );
  }

  /** Apply UTC day rollover before policy checks or summaries. */
  touchSessionBudget(session: GatewaySession): void {
    ensureDailyMarginCurrentDay(session);
  }

  /** Agent-facing propose — never returns key material. */
  propose(agent: AgentCredential, intent: TradeIntent) {
    assertAgentHasNoSigningKey(agent);

    if (isGranteeMaterialExposedToAgent(process.env)) {
      this.audit.append(
        "key_isolation_fail",
        "Grantee private key present in process.env",
      );
      throw new Error("non-bypass violation: grantee key in environment");
    }

    const sessionId = this.tokenToSession.get(agent.apiToken);
    if (!sessionId) {
      return {
        status: "denied" as const,
        decisionReasons: ["unknown agent token"],
        signed: false as const,
        wouldSign: false as const,
      };
    }

    const session = this.sessions.get(sessionId);
    if (session) this.touchSessionBudget(session);
    if (
      session?.agentTokenExpiresAt &&
      Date.now() >= Date.parse(session.agentTokenExpiresAt)
    ) {
      return {
        status: "denied" as const,
        decisionReasons: ["agent token expired — create a new session"],
        signed: false as const,
        wouldSign: false as const,
      };
    }

    if (!session) {
      return {
        status: "denied" as const,
        decisionReasons: ["session missing"],
        signed: false as const,
        wouldSign: false as const,
      };
    }

    if (session.revoked) {
      const result = {
        status: "denied" as const,
        decisionReasons: ["session revoked"],
        signed: false as const,
        wouldSign: false as const,
        broadcast: false as const,
        sessionId,
      };
      maybeDispatchWebhook(
        this.audit.append("propose_denied", "Revoked session", {
          sessionId,
          intent,
        }),
      );
      return result;
    }

    const decision = evaluateTradeIntent(session.policy, intent, {
      dailyMarginUsed: session.dailyMarginUsed,
    });

    if (!decision.allow) {
      maybeDispatchWebhook(
        this.audit.append("propose_denied", decision.reasons.join("; "), {
          sessionId,
          intent,
        }),
      );
      return {
        status: "denied" as const,
        decisionReasons: decision.reasons,
        signed: false as const,
        wouldSign: false as const,
        broadcast: false as const,
        sessionId,
      };
    }

    // Propose is a dry-run policy check — daily budget increments on successful execute only.
    maybeDispatchWebhook(
      this.audit.append("propose_allowed", decision.reasons.join("; "), {
        sessionId,
        intent,
        wouldSign: true,
        signed: false,
        dryRun: true,
      }),
    );

    return {
      status: "allowed" as const,
      decisionReasons: decision.reasons,
      signed: false as const,
      wouldSign: true as const,
      dryRun: true as const,
      broadcast: false as const,
      note: "Policy OK — no margin reserved until POST /v1/execute succeeds",
      sessionId,
      granteeAddress: session.granteeAddress,
    };
  }

  /** Sidecar: restore a persisted session (includes grantee key material). */
  importSession(session: GatewaySession): void {
    this.sessions.set(session.sessionId, session);
    if (!session.revoked) {
      this.tokenToSession.set(session.agentApiToken, session.sessionId);
    }
  }

  exportSessions(): GatewaySession[] {
    return [...this.sessions.values()];
  }

  revoke(sessionId: string): PublicSessionView {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`unknown session ${sessionId}`);
    }
    session.revoked = true;
    this.tokenToSession.delete(session.agentApiToken);
    // Zeroize key material from process memory as best-effort.
    session.granteePrivateKeyHex = "";
    this.audit.append("revoke", "Session revoked; grantee key cleared", {
      sessionId,
    });
    return this.toPublic(session);
  }

  /** Test-only: prove gateway holds key while agent view does not. */
  debugHasGranteeKey(sessionId: string): boolean {
    const s = this.sessions.get(sessionId);
    return Boolean(s && s.granteePrivateKeyHex.length === 64);
  }

  getSessionRecord(sessionId: string): GatewaySession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Agent-safe session summary (no keys). */
  getAgentSessionSummary(agentApiToken: string):
    | {
        sessionId: string;
        revoked: boolean;
        dailyMarginUsed: string;
        dailyMarginBudget: string;
        dailyMarginRemaining: string;
        dailyMarginDay?: string;
        maxOrderNotional: string;
        marketIds: string[];
        granteeAddress: string;
        ownerInjectiveAddress?: string;
      }
    | undefined {
    const session = this.getSessionForAgent(agentApiToken);
    if (!session) return undefined;
    this.touchSessionBudget(session);
    const budget = Number(session.policy.dailyMarginBudget);
    const used = Number(session.dailyMarginUsed);
    const remaining = Number.isFinite(budget) && Number.isFinite(used)
      ? Math.max(0, budget - used)
      : 0;
    return {
      sessionId: session.sessionId,
      revoked: session.revoked,
      dailyMarginUsed: session.dailyMarginUsed,
      dailyMarginBudget: session.policy.dailyMarginBudget,
      dailyMarginRemaining: String(remaining),
      dailyMarginDay: session.dailyMarginDay,
      maxOrderNotional: session.policy.maxOrderNotional ?? "",
      marketIds: session.policy.marketIds,
      granteeAddress: session.granteeAddress,
      ownerInjectiveAddress: session.ownerInjectiveAddress,
    };
  }

  private toPublic(session: GatewaySession): PublicSessionView {
    return {
      sessionId: session.sessionId,
      granteeAddress: session.granteeAddress,
      ownerInjectiveAddress: session.ownerInjectiveAddress,
      subaccountId: session.subaccountId,
      policy: session.policy,
      policyEnglish: explainPolicy(session.policy),
      dailyMarginUsed: session.dailyMarginUsed,
      revoked: session.revoked,
      createdAt: session.createdAt,
    };
  }
}
