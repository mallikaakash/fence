import type { SessionGrantStatus } from "../authz/verifySessionGrant.ts";

/** Exit code when live protocol E2E prerequisites are not on testnet (not a test pass). */
export const E2E_PROTOCOL_EXIT_BLOCKED = 2;

export function isMissingTestnetAuthzGrants(status: SessionGrantStatus): boolean {
  if (
    status.issues.some((i) => /no AuthZ grants from/i.test(i)) ||
    status.issues.some((i) => /no CreateDerivativeLimitOrderAuthz/i.test(i))
  ) {
    return true;
  }
  if (status.matchingGrants === 0 && status.grantsSummary.length === 0) {
    return true;
  }
  const missingLimit = status.issues.some((i) =>
    /missing place-order wallet permission/i.test(i),
  );
  const missingCancel = status.issues.some((i) =>
    /missing cancel-order wallet permission/i.test(i),
  );
  return missingLimit && missingCancel && !status.limitReady && !status.cancelReady;
}

export function formatBlockedGrantMessage(status: SessionGrantStatus): string {
  const lines = [
    "BLOCKED: testnet AuthZ grants missing",
    "",
    "Protocol E2E live checks require typed AuthZ grants (CreateDerivativeLimitOrderAuthz + cancel) from the fixture granter to grantee on testnet.",
    `Granter: ${status.granter}`,
    `Grantee: ${status.grantee}`,
    `Network: ${status.network}`,
    "",
    "Provision grants via gateway grant-tx-plan (owner wallet); then run:",
    "  INTENTGUARD_E2E_LIVE=1 npm run e2e:protocol",
    "",
    "On-chain issues:",
    ...status.issues.map((i) => `  - ${i}`),
  ];
  return lines.join("\n");
}
