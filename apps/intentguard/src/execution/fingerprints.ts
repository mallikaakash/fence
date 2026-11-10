import { createHash } from "node:crypto";
import type { IntentGuardPolicy, TradeIntent } from "../policy/types.ts";
import { stableStringify } from "./stableJson.ts";

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export function hashIdempotencyKey(sessionId: string, rawKey: string): string {
  return sha256Hex(`${sessionId}:${rawKey.trim()}`);
}

export function agentTokenFingerprint(agentApiToken: string): string {
  return sha256Hex(agentApiToken).slice(0, 24);
}

export function policyFingerprint(policy: IntentGuardPolicy): string {
  const canonical = {
    version: policy.version,
    marketIds: [...policy.marketIds].sort(),
    maxMarginPerOrder: String(policy.maxMarginPerOrder),
    maxOrderNotional:
      policy.maxOrderNotional !== undefined
        ? String(policy.maxOrderNotional)
        : null,
    maxLeverage: Number(policy.maxLeverage),
    dailyMarginBudget: String(policy.dailyMarginBudget),
    expiresAt: policy.expiresAt ?? null,
    reduceOnlyAlwaysAllowed: policy.reduceOnlyAlwaysAllowed ?? true,
  };
  return sha256Hex(stableStringify(canonical));
}

export type IntentBindingContext = {
  sessionId: string;
  subaccountId: string;
  orderType: "derivative_limit";
};

export function tradeIntentFingerprint(
  intent: TradeIntent,
  ctx: IntentBindingContext,
): string {
  const canonical = {
    sessionId: ctx.sessionId,
    subaccountId: ctx.subaccountId,
    orderType: ctx.orderType,
    marketId: intent.marketId,
    margin: String(intent.margin),
    leverage: Number(intent.leverage),
    price: intent.price !== undefined ? String(intent.price) : null,
    quantity: intent.quantity !== undefined ? String(intent.quantity) : null,
    reduceOnly: Boolean(intent.reduceOnly),
    side: intent.side ?? null,
  };
  return sha256Hex(stableStringify(canonical));
}

export function executeRequestFingerprint(params: {
  proposalId: string;
  intentFingerprint: string;
}): string {
  return sha256Hex(stableStringify(params));
}
