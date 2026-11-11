import { CreateDerivativeLimitOrderAuthz } from "@injectivelabs/core-proto-ts-v2/generated/injective/exchange/v1beta1/authz_pb.js";
import { CancelDerivativeOrderAuthz } from "@injectivelabs/core-proto-ts-v2/generated/injective/exchange/v1beta1/authz_pb.js";
import type { IntentGuardPolicy } from "../policy/types.ts";
import type { GrantPlan } from "./planGrant.ts";
import { parseLcdAuthorization } from "./parseLcdAuthz.ts";
import { TYPED_EXCHANGE_AUTHZ } from "./types.ts";

const LIMIT = TYPED_EXCHANGE_AUTHZ.CreateDerivativeLimitOrderAuthz;
const CANCEL = TYPED_EXCHANGE_AUTHZ.CancelDerivativeOrderAuthz;
const GENERIC = /GenericAuthorization/i;

export type WireMsgGrant = {
  granter?: string;
  grantee?: string;
  expiration?: number;
  authorization?: { typeUrl?: string; value?: unknown };
};

export type GrantTxPlanWire = {
  expirationUnix?: number;
  expirationIso?: string;
  msgGrants?: WireMsgGrant[];
};

function normHex(id: string): string {
  return id.toLowerCase().replace(/^0x/, "");
}

function marketsEqual(a: string[], b: string[]): boolean {
  const sa = [...a].map(normHex).sort();
  const sb = [...b].map(normHex).sort();
  return sa.length === sb.length && sa.every((m, i) => m === sb[i]);
}

function decodeTypedScope(
  typeUrl: string,
  bytes: Uint8Array,
): { subaccountId: string; marketIds: string[] } | null {
  try {
    if (typeUrl.includes("CreateDerivativeLimitOrderAuthz")) {
      const decoded = CreateDerivativeLimitOrderAuthz.fromBinary(bytes);
      return { subaccountId: decoded.subaccountId, marketIds: [...decoded.marketIds] };
    }
    if (typeUrl.includes("CancelDerivativeOrderAuthz")) {
      const decoded = CancelDerivativeOrderAuthz.fromBinary(bytes);
      return { subaccountId: decoded.subaccountId, marketIds: [...decoded.marketIds] };
    }
  } catch {
    return null;
  }
  return null;
}

function bytesFromWire(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") {
    try {
      return Uint8Array.from(Buffer.from(value, "base64"));
    } catch {
      return null;
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const nums = Object.entries(value as Record<string, number>)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, n]) => n);
    return Uint8Array.from(nums);
  }
  return null;
}

export function validateGrantTxPlanAgainstSession(params: {
  sessionId: string;
  ownerInjectiveAddress: string;
  granteeAddress: string;
  subaccountId: string;
  policy: IntentGuardPolicy;
  grantPlan: GrantPlan;
  txPlan: GrantTxPlanWire;
  nowMs?: number;
}): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const { grantPlan, txPlan } = params;
  const now = params.nowMs ?? Date.now();

  if (grantPlan.granteeAddress !== params.granteeAddress) {
    errors.push("grant plan grantee differs from session");
  }
  if (!marketsEqual(grantPlan.marketIds, params.policy.marketIds)) {
    errors.push("grant plan markets differ from session policy");
  }
  if (grantPlan.subaccountId !== params.subaccountId) {
    errors.push("grant plan subaccount differs from session");
  }

  const msgList = txPlan.msgGrants ?? [];
  if (msgList.length !== 2) {
    errors.push(`expected 2 MsgGrant messages, got ${msgList.length}`);
  }

  let sawLimit = false;
  let sawCancel = false;
  let sharedExp: number | null = null;

  for (const m of msgList) {
    if (m.granter !== params.ownerInjectiveAddress) {
      errors.push("MsgGrant granter differs from session owner");
    }
    if (m.grantee !== params.granteeAddress) {
      errors.push("MsgGrant grantee differs from session grantee");
    }
    const exp = m.expiration;
    if (exp == null || !Number.isFinite(exp)) {
      errors.push("MsgGrant missing expiration");
    } else {
      if (sharedExp == null) sharedExp = exp;
      else if (sharedExp !== exp) errors.push("MsgGrant expirations differ");
      if (exp * 1000 <= now) errors.push("MsgGrant expiration is in the past");
    }

    const typeUrl = m.authorization?.typeUrl ?? "";
    if (GENERIC.test(typeUrl)) {
      errors.push("GenericAuthorization not allowed");
    }

    const bytes = bytesFromWire(m.authorization?.value);
    const scoped = bytes ? decodeTypedScope(typeUrl, bytes) : null;
    const parsed = scoped
      ? {
          authorizationType: typeUrl,
          subaccountId: scoped.subaccountId,
          marketIds: scoped.marketIds,
        }
      : parseLcdAuthorization(m.authorization as Record<string, unknown> | undefined);
    if (!parsed?.subaccountId || !parsed.marketIds?.length) {
      errors.push(`authorization scope not decodable: ${typeUrl}`);
      continue;
    }
    if (normHex(parsed.subaccountId) !== normHex(params.subaccountId)) {
      errors.push("authorization subaccount mismatch");
    }
    if (!marketsEqual(parsed.marketIds, params.policy.marketIds)) {
      errors.push("authorization markets mismatch vs session policy");
    }

    if (typeUrl === LIMIT || typeUrl.includes("CreateDerivativeLimitOrderAuthz")) {
      sawLimit = true;
    } else if (typeUrl === CANCEL || typeUrl.includes("CancelDerivativeOrderAuthz")) {
      sawCancel = true;
    } else {
      errors.push(`unexpected authorization type: ${typeUrl}`);
    }
  }

  if (!sawLimit) errors.push("missing CreateDerivativeLimitOrderAuthz");
  if (!sawCancel) errors.push("missing CancelDerivativeOrderAuthz");

  if (txPlan.expirationUnix && sharedExp && txPlan.expirationUnix !== sharedExp) {
    errors.push("txPlan expirationUnix inconsistent with msgGrants");
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}
