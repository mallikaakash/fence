/** Parsed gateway grant-status payload for UI. */
export type ParsedGrantStatus = {
  ready: boolean;
  limitReady: boolean;
  cancelReady: boolean;
  userFacingIssues: string[];
};

export function parseGrantStatusJson(json: unknown): ParsedGrantStatus {
  const gs = (json as { grantStatus?: Record<string, unknown> }).grantStatus ?? {};
  const limitReady =
    typeof gs.limitReady === "boolean"
      ? Boolean(gs.limitReady)
      : Boolean(gs.ready);
  const cancelReady =
    typeof gs.cancelReady === "boolean"
      ? Boolean(gs.cancelReady)
      : Boolean(gs.ready);
  const ready = Boolean(gs.ready) && limitReady && cancelReady;
  const userFacingIssues = Array.isArray(gs.userFacingIssues)
    ? (gs.userFacingIssues as string[])
    : [];
  return {
    ready: ready && limitReady && cancelReady,
    limitReady,
    cancelReady,
    userFacingIssues,
  };
}
