/** Bounds for on-chain AuthZ MsgGrant expiration (owner-selected). */
export const GRANT_EXPIRY_MIN_SECONDS = 300;
export const GRANT_EXPIRY_MAX_SECONDS = 7 * 24 * 60 * 60;

export type GrantExpiryResolution =
  | { ok: true; expirySeconds: number }
  | { ok: false; error: string; code: "grant_expiry_required" | "grant_expiry_invalid" };

/**
 * Resolve grant duration for grant-tx-plan.
 * Existing sessions without stored expiry require an explicit query value.
 */
export function resolveGrantExpirySeconds(opts: {
  queryExpirySeconds: number | null | undefined;
  sessionGrantExpirySeconds: number | undefined;
}): GrantExpiryResolution {
  const fromQuery = opts.queryExpirySeconds;
  if (fromQuery != null && Number.isFinite(fromQuery)) {
    const sec = Math.floor(fromQuery);
    if (sec < GRANT_EXPIRY_MIN_SECONDS) {
      return {
        ok: false,
        code: "grant_expiry_invalid",
        error: `expirySeconds must be at least ${GRANT_EXPIRY_MIN_SECONDS}`,
      };
    }
    if (sec > GRANT_EXPIRY_MAX_SECONDS) {
      return {
        ok: false,
        code: "grant_expiry_invalid",
        error: `expirySeconds must be at most ${GRANT_EXPIRY_MAX_SECONDS}`,
      };
    }
    return { ok: true, expirySeconds: sec };
  }

  if (opts.sessionGrantExpirySeconds != null && opts.sessionGrantExpirySeconds > 60) {
    const sec = Math.floor(opts.sessionGrantExpirySeconds);
    if (sec >= GRANT_EXPIRY_MIN_SECONDS && sec <= GRANT_EXPIRY_MAX_SECONDS) {
      return { ok: true, expirySeconds: sec };
    }
  }

  return {
    ok: false,
    code: "grant_expiry_required",
    error:
      "expirySeconds query parameter required (explicit owner choice) — omit default 24h grant",
  };
}
