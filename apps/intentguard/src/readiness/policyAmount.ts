export type PolicyAmountParse =
  | { ok: true; chainUnits: bigint; normalizedHuman: string }
  | { ok: false; reason: string; status: "action_required" | "unavailable" };

/**
 * Parse a non-negative decimal policy string into chain integer units without floats.
 */
export function parsePolicyQuoteAmount(
  human: string,
  decimals: number,
): PolicyAmountParse {
  if (typeof human !== "string") {
    return {
      ok: false,
      reason: "maxMarginPerOrder must be a string",
      status: "action_required",
    };
  }
  const trimmed = human.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason: "maxMarginPerOrder is empty",
      status: "action_required",
    };
  }
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return {
      ok: false,
      reason: "maxMarginPerOrder is not a valid decimal",
      status: "action_required",
    };
  }
  if (trimmed.startsWith("-")) {
    return {
      ok: false,
      reason: "maxMarginPerOrder cannot be negative",
      status: "action_required",
    };
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    return {
      ok: false,
      reason: "quote decimals unavailable for margin conversion",
      status: "unavailable",
    };
  }
  const [wholePart, fracPart = ""] = trimmed.split(".");
  if (fracPart.length > decimals) {
    return {
      ok: false,
      reason: `maxMarginPerOrder has more than ${decimals} decimal places for this market`,
      status: "action_required",
    };
  }
  const wholeDigits = wholePart.replace(/^0+/, "") || "0";
  const fracDigits = fracPart.padEnd(decimals, "0");
  const combined = (wholeDigits + fracDigits).replace(/^0+/, "") || "0";
  if (combined === "0") {
    return {
      ok: false,
      reason: "maxMarginPerOrder must be greater than zero for collateral readiness",
      status: "action_required",
    };
  }
  try {
    return {
      ok: true,
      chainUnits: BigInt(combined),
      normalizedHuman: trimmed,
    };
  } catch {
    return {
      ok: false,
      reason: "maxMarginPerOrder is too large to represent",
      status: "action_required",
    };
  }
}
