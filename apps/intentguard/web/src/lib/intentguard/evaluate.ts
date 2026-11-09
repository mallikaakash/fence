import type {
  EvaluateOptions,
  IntentGuardPolicy,
  PolicyDecision,
  TradeIntent,
} from "./policy-types";

function parseAmount(value: string, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return n;
}

/**
 * Pure policy gate. Does not sign or touch the chain.
 * Gateway must call this before any MsgExec / order broadcast.
 */
export function evaluateTradeIntent(
  policy: IntentGuardPolicy,
  intent: TradeIntent,
  options: EvaluateOptions = {},
): PolicyDecision {
  const reasons: string[] = [];
  const reduceOnly = intent.reduceOnly === true;
  const reduceAlways = policy.reduceOnlyAlwaysAllowed !== false;

  if (reduceOnly && reduceAlways) {
    return {
      allow: true,
      reasons: ["reduce-only always allowed by policy"],
    };
  }

  const now = options.nowMs ?? Date.now();
  if (policy.expiresAt) {
    const exp = Date.parse(policy.expiresAt);
    if (!Number.isFinite(exp)) {
      return { allow: false, reasons: [`invalid policy expiresAt: ${policy.expiresAt}`] };
    }
    if (now >= exp) {
      return { allow: false, reasons: [`policy expired at ${policy.expiresAt}`] };
    }
  }

  const normalizedMarkets = new Set(
    policy.marketIds.map((id) => id.toLowerCase()),
  );
  if (normalizedMarkets.size === 0) {
    return { allow: false, reasons: ["policy has empty marketIds (deny all)"] };
  }
  if (!normalizedMarkets.has(intent.marketId.toLowerCase())) {
    reasons.push(
      `market ${intent.marketId} not in allowlist (${policy.marketIds.join(", ")})`,
    );
  }

  let margin: number;
  let maxMargin: number;
  let dailyBudget: number;
  let dailyUsed: number;
  try {
    margin = parseAmount(intent.margin, "intent.margin");
    maxMargin = parseAmount(policy.maxMarginPerOrder, "maxMarginPerOrder");
    dailyBudget = parseAmount(policy.dailyMarginBudget, "dailyMarginBudget");
    dailyUsed = parseAmount(options.dailyMarginUsed ?? "0", "dailyMarginUsed");
  } catch (err) {
    return {
      allow: false,
      reasons: [err instanceof Error ? err.message : String(err)],
    };
  }

  if (margin > maxMargin) {
    reasons.push(
      `margin ${intent.margin} > maxMarginPerOrder ${policy.maxMarginPerOrder}`,
    );
  }

  if (!(policy.maxLeverage > 0)) {
    reasons.push(`invalid maxLeverage ${policy.maxLeverage}`);
  } else if (intent.leverage > policy.maxLeverage) {
    reasons.push(
      `leverage ${intent.leverage}x > policy max ${policy.maxLeverage}x`,
    );
  }

  const hasPrice = intent.price !== undefined && intent.price !== "";
  const hasQty = intent.quantity !== undefined && intent.quantity !== "";
  let notionalReason: string | undefined;
  if (policy.maxOrderNotional) {
    if (!hasPrice || !hasQty) {
      reasons.push(
        "maxOrderNotional set but intent missing price and/or quantity",
      );
    } else {
      try {
        const price = parseAmount(intent.price!, "intent.price");
        const quantity = parseAmount(intent.quantity!, "intent.quantity");
        const maxNotional = parseAmount(
          policy.maxOrderNotional,
          "maxOrderNotional",
        );
        const notional = price * quantity;
        if (notional > maxNotional) {
          reasons.push(
            `notional ${notional} (price×qty) > maxOrderNotional ${policy.maxOrderNotional}`,
          );
        } else {
          notionalReason = `notional ${notional} <= ${policy.maxOrderNotional}`;
        }
      } catch (err) {
        reasons.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  if (dailyUsed + margin > dailyBudget) {
    reasons.push(
      `daily margin ${dailyUsed + margin} would exceed budget ${policy.dailyMarginBudget} (used ${dailyUsed})`,
    );
  }

  if (reasons.length > 0) {
    return { allow: false, reasons };
  }

  return {
    allow: true,
    reasons: [
      `market allowlisted`,
      `margin ${intent.margin} <= ${policy.maxMarginPerOrder}`,
      `leverage ${intent.leverage}x <= ${policy.maxLeverage}x`,
      ...(notionalReason ? [notionalReason] : []),
      `daily budget ok`,
    ],
  };
}
