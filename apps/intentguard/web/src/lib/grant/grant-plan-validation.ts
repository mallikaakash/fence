import {
  GRANT_EXPIRY_MAX_SECONDS,
  GRANT_EXPIRY_MIN_SECONDS,
} from "./grant-expiry.ts";

const LIMIT =
  "/injective.exchange.v1beta1.CreateDerivativeLimitOrderAuthz";
const CANCEL = "/injective.exchange.v1beta1.CancelDerivativeOrderAuthz";

export type SessionGrantContext = {
  sessionId: string;
  ownerInjectiveAddress: string;
  granteeAddress: string;
  subaccountId: string;
  policy: {
    marketIds: string[];
    maxMarginPerOrder: string;
    maxOrderNotional?: string;
    maxLeverage: number;
    dailyMarginBudget: string;
  };
  revoked?: boolean;
};

export type GrantTxPlanResponse = {
  sessionId: string;
  expirySeconds?: number;
  planGeneratedAt?: string;
  grantPlan: {
    granteeAddress: string;
    subaccountId: string;
    marketIds: string[];
    expirySeconds: number;
    typedGrants?: Array<{ authorizationTypeUrl: string }>;
  };
  txPlan: {
    expirationUnix: number;
    expirationIso: string;
    msgGrants: Array<{
      granter?: string;
      grantee?: string;
      expiration?: number;
      authorization?: { typeUrl?: string; value?: unknown };
    }>;
  };
};

export type PreSignValidationInput = {
  network: "testnet" | "mainnet";
  connectedWallet: string | null;
  session: SessionGrantContext;
  planEnvelope: GrantTxPlanResponse;
  expirySecondsChosen: number;
  sessionSnapshotAtFetch: SessionGrantContext | null;
  nowMs?: number;
};

function normHex(id: string): string {
  return id.toLowerCase().replace(/^0x/, "");
}

function marketsEqual(a: string[], b: string[]): boolean {
  const sa = [...a].map(normHex).sort();
  const sb = [...b].map(normHex).sort();
  return sa.length === sb.length && sa.every((m, i) => m === sb[i]);
}

export function sessionFingerprint(s: SessionGrantContext): string {
  return JSON.stringify({
    sessionId: s.sessionId,
    owner: s.ownerInjectiveAddress,
    grantee: s.granteeAddress,
    sub: s.subaccountId,
    markets: [...s.policy.marketIds].map(normHex).sort(),
  });
}

export function validatePreSignGrant(input: PreSignValidationInput): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const now = input.nowMs ?? Date.now();

  if (input.network !== "testnet") {
    errors.push("Only Injective testnet grants are supported in this phase");
  }

  const wallet = input.connectedWallet?.trim() ?? "";
  if (!wallet.startsWith("inj1")) {
    errors.push("Connect Keplr — wallet address required");
  } else if (wallet !== input.session.ownerInjectiveAddress) {
    errors.push(
      `Connected wallet (${wallet}) is not this session's owner (${input.session.ownerInjectiveAddress})`,
    );
  }

  if (input.session.revoked) {
    errors.push("Session is revoked");
  }

  const { planEnvelope: env } = input;
  if (env.sessionId !== input.session.sessionId) {
    errors.push("Plan sessionId mismatch");
  }

  if (
    input.expirySecondsChosen < GRANT_EXPIRY_MIN_SECONDS ||
    input.expirySecondsChosen > GRANT_EXPIRY_MAX_SECONDS
  ) {
    errors.push("Expiry duration out of allowed bounds");
  }

  if (env.expirySeconds != null && env.expirySeconds !== input.expirySecondsChosen) {
    errors.push("Plan expirySeconds does not match owner selection — re-fetch plan");
  }

  const plan = env.grantPlan;
  if (plan.granteeAddress !== input.session.granteeAddress) {
    errors.push("Plan grantee differs from session");
  }
  if (plan.subaccountId !== input.session.subaccountId) {
    errors.push("Plan subaccount differs from session");
  }
  if (!marketsEqual(plan.marketIds, input.session.policy.marketIds)) {
    errors.push("Plan markets differ from session policy");
  }

  if (input.sessionSnapshotAtFetch) {
    if (sessionFingerprint(input.sessionSnapshotAtFetch) !== sessionFingerprint(input.session)) {
      errors.push("Session changed since plan was generated — re-fetch plan");
    }
  }

  const msgs = env.txPlan.msgGrants ?? [];
  if (msgs.length !== 2) {
    errors.push(`Expected 2 MsgGrant messages, got ${msgs.length}`);
  }

  let sawLimit = false;
  let sawCancel = false;
  let sharedExp: number | null = null;

  for (const m of msgs) {
    if (m.granter !== input.session.ownerInjectiveAddress) {
      errors.push("MsgGrant granter does not match session owner");
    }
    if (m.grantee !== input.session.granteeAddress) {
      errors.push("MsgGrant grantee does not match session grantee");
    }
    const exp = m.expiration;
    if (exp == null) {
      errors.push("MsgGrant missing expiration");
    } else {
      if (sharedExp == null) sharedExp = exp;
      else if (sharedExp !== exp) errors.push("MsgGrant expirations differ");
      if (exp * 1000 <= now) errors.push("Grant expiration is already in the past");
    }
    const typeUrl = m.authorization?.typeUrl ?? "";
    if (/GenericAuthorization/i.test(typeUrl)) {
      errors.push("GenericAuthorization is not permitted");
    }
    if (typeUrl === LIMIT || typeUrl.includes("CreateDerivativeLimitOrderAuthz")) {
      sawLimit = true;
    } else if (typeUrl === CANCEL || typeUrl.includes("CancelDerivativeOrderAuthz")) {
      sawCancel = true;
    } else if (typeUrl) {
      errors.push(`Unexpected authorization type: ${typeUrl}`);
    }
  }

  if (!sawLimit) errors.push("Missing CreateDerivativeLimitOrderAuthz");
  if (!sawCancel) errors.push("Missing CancelDerivativeOrderAuthz");

  if (env.txPlan.expirationUnix && sharedExp && env.txPlan.expirationUnix !== sharedExp) {
    errors.push("txPlan expiration inconsistent with MsgGrant expirations");
  }

  return { ok: errors.length === 0, errors };
}

export type GrantVerificationPhase =
  | "idle"
  | "wallet_approved"
  | "broadcast_ok"
  | "broadcast_failed"
  | "broadcast_unknown"
  | "wallet_rejected"
  | "verifying"
  | "verified_ready"
  | "verified_partial"
  | "verification_unavailable";

export function interpretGrantStatus(gs: {
  ready: boolean;
  scopeMatch?: boolean;
  issues?: string[];
  limitReady?: boolean;
  cancelReady?: boolean;
  limitGrant?: { ok?: boolean };
  cancelGrant?: { ok?: boolean };
}): GrantVerificationPhase {
  if (gs.ready) return "verified_ready";
  const limitOk = gs.limitReady ?? gs.limitGrant?.ok;
  const cancelOk = gs.cancelReady ?? gs.cancelGrant?.ok;
  if (limitOk === true && cancelOk !== true) return "verified_partial";
  if (cancelOk === true && limitOk !== true) return "verified_partial";
  return "verifying";
}
