/** Keep in sync with apps/intentguard/src/authz/grantExpiry.ts */
export const GRANT_EXPIRY_MIN_SECONDS = 300;
export const GRANT_EXPIRY_MAX_SECONDS = 7 * 24 * 60 * 60;

export const GRANT_EXPIRY_PRESETS = [
  { label: "1 hour", seconds: 3600 },
  { label: "24 hours", seconds: 86_400 },
  { label: "7 days", seconds: 604_800 },
] as const;

export function formatDurationSeconds(seconds: number): string {
  if (seconds % 86_400 === 0 && seconds >= 86_400) {
    const days = seconds / 86_400;
    return days === 1 ? "24 hours" : `${days} days`;
  }
  if (seconds % 3600 === 0 && seconds >= 3600) {
    return `${seconds / 3600} hour${seconds / 3600 === 1 ? "" : "s"}`;
  }
  return `${seconds} seconds`;
}

export function validateExpiryChoice(seconds: number): string | null {
  if (!Number.isFinite(seconds)) return "Invalid duration";
  const sec = Math.floor(seconds);
  if (sec < GRANT_EXPIRY_MIN_SECONDS) {
    return `Duration must be at least ${GRANT_EXPIRY_MIN_SECONDS} seconds`;
  }
  if (sec > GRANT_EXPIRY_MAX_SECONDS) {
    return `Duration must be at most ${GRANT_EXPIRY_MAX_SECONDS} seconds`;
  }
  return null;
}
