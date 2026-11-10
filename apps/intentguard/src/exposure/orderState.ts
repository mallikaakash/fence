/** Confirmed open / closed / unknown — Injective OrderStatus-style values. */
export type DerivativeOrderStateClass = "open" | "closed" | "unknown";

const OPEN_STATES = new Set(["BOOKED", "PARTIAL_FILLED"]);
const CLOSED_STATES = new Set(["FILLED", "CANCELLED", "CANCELED", "EXPIRED"]);

/** Normalize raw indexer state strings (casing, spaces, hyphens). */
export function normalizeDerivativeOrderStateKey(raw: string): string {
  return raw.trim().replace(/[\s-]+/g, "_").toUpperCase();
}

export function classifyDerivativeOrderState(raw: string): DerivativeOrderStateClass {
  const key = normalizeDerivativeOrderStateKey(raw);
  if (!key) return "unknown";
  if (OPEN_STATES.has(key)) return "open";
  if (CLOSED_STATES.has(key)) return "closed";
  return "unknown";
}

export function isConfirmedOpenDerivativeOrderState(raw: string): boolean {
  return classifyDerivativeOrderState(raw) === "open";
}
