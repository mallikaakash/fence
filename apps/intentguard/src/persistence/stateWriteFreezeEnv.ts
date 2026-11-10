/** Operator / deploy guard — blocks all persistent mutations (not just execute). */
export function isStateWriteFreezeEnvEnabled(): boolean {
  const v = process.env.INTENTGUARD_STATE_WRITE_FREEZE;
  return v === "1" || v === "true";
}

export const STATE_WRITE_FROZEN_ERROR_CODE = "state_write_frozen" as const;
export const STATE_WRITE_FROZEN_MESSAGE =
  "gateway state write freeze — persistent mutations paused";
