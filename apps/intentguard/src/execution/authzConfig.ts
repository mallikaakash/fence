/**
 * Fail-closed on-chain AuthZ configuration for hosted / testnet demo runtimes.
 * Local unit tests pass `requireOnChainGrant: false` in orchestrator deps — not env bypass.
 */

export function isLocalAuthzBypassAllowed(): boolean {
  return process.env.INTENTGUARD_ALLOW_AUTHZ_BYPASS === "1";
}

export function isHostedRuntime(): boolean {
  return (
    process.env.INTENTGUARD_HOSTED === "1" ||
    process.env.DOCKER === "1" ||
    process.env.NODE_ENV === "production"
  );
}

/** Called at gateway startup after reading env. */
export function enforceHostedAuthzPolicy(requireOnChainGrant: boolean): void {
  if (isHostedRuntime() && isLocalAuthzBypassAllowed()) {
    throw new Error(
      "INTENTGUARD_ALLOW_AUTHZ_BYPASS=1 is forbidden on hosted runtime (DOCKER, INTENTGUARD_HOSTED, or NODE_ENV=production).",
    );
  }
  if (isHostedRuntime() && !requireOnChainGrant) {
    throw new Error(
      "INTENTGUARD_REQUIRE_ONCHAIN_GRANT=0 is forbidden for hosted configuration. Typed on-chain AuthZ is mandatory.",
    );
  }
  if (!requireOnChainGrant && isLocalAuthzBypassAllowed()) {
    console.error(
      "[intentguard] WARNING: INTENTGUARD_REQUIRE_ONCHAIN_GRANT=0 with INTENTGUARD_ALLOW_AUTHZ_BYPASS=1 — local dev only",
    );
  }
}

/** Execute-time: refuse hosted misconfiguration even if startup was bypassed. */
export function assertHostedExecuteAuthzConfig(requireOnChainGrant: boolean): void {
  if (isHostedRuntime() && (!requireOnChainGrant || isLocalAuthzBypassAllowed())) {
    throw new Error("hosted execute requires typed on-chain AuthZ");
  }
}

/** Whether to run verifySessionGrantOnChain in the orchestrator. */
export function shouldVerifyAuthzAtExecute(requireOnChainGrant: boolean): boolean {
  if (isHostedRuntime()) return true;
  return requireOnChainGrant;
}
