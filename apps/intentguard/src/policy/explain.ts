import type { IntentGuardPolicy } from "./types.ts";

/** Round-trip: policy JSON → human English (user should sign what they read). */
export function explainPolicy(policy: IntentGuardPolicy): string {
  const markets =
    policy.marketIds.length === 0
      ? "no markets (deny all)"
      : policy.marketIds.join(", ");
  const reduce =
    policy.reduceOnlyAlwaysAllowed === false
      ? "Reduce-only closes are NOT specially privileged."
      : "Closing/reducing positions is always allowed.";
  const expiry = policy.expiresAt
    ? `Expires at ${policy.expiresAt}.`
    : "No expiry set.";

  const notional = policy.maxOrderNotional
    ? `- Max order notional (price×qty): ${policy.maxOrderNotional}`
    : `- Max order notional: not set (margin/leverage only)`;

  return [
    `IntentGuard policy v${policy.version}:`,
    `- Allowed markets: ${markets}`,
    `- Max margin per order: ${policy.maxMarginPerOrder}`,
    notional,
    `- Max leverage: ${policy.maxLeverage}x`,
    `- Daily margin budget: ${policy.dailyMarginBudget}`,
    `- ${reduce}`,
    `- ${expiry}`,
  ].join("\n");
}
