import type { ParsedGrantStatus } from "@/lib/grant-status";

export type WalletLcdClass = "cleared" | "incomplete_on_chain" | "inconclusive";

/**
 * Classify on-chain wallet permission from a successful grant-status LCD response.
 * Never call this when HTTP/LCD failed — use inconclusive instead.
 */
export function classifyWalletFromGrantStatus(
  parsed: ParsedGrantStatus,
): Exclude<WalletLcdClass, "inconclusive"> {
  if (!parsed.limitReady && !parsed.cancelReady) {
    return "cleared";
  }
  return "incomplete_on_chain";
}

/** Map LCD class to turn-off wallet dimension (inconclusive → pending_confirmation). */
export function lcdClassToWalletOutcome(
  lcd: WalletLcdClass,
): "cleared" | "incomplete_on_chain" | "pending_confirmation" {
  if (lcd === "cleared") return "cleared";
  if (lcd === "incomplete_on_chain") return "incomplete_on_chain";
  return "pending_confirmation";
}
