import { fetchGranterGrants } from "./fetchGrants.ts";
import type { GatewaySession } from "../gateway/session.ts";
import { LIMIT_AUTHZ } from "./parseLcdAuthz.ts";
import { evaluateTypedGrantsForSession } from "./evaluateTypedGrants.ts";

export type SessionGrantStatus = {
  granter: string;
  grantee: string;
  network: string;
  /** Both typed limit + cancel grants match scope and are active. */
  ready: boolean;
  limitReady: boolean;
  cancelReady: boolean;
  scopeMatch: boolean;
  matchingGrants: number;
  issues: string[];
  userFacingIssues: string[];
  endpoint: string;
  grantsSummary: Array<{
    authorizationType: string;
    expiration?: string;
    subaccountId?: string;
    marketIds?: string[];
  }>;
  onChainLimitScopes: Array<{
    subaccountId: string;
    marketIds: string[];
    expiration?: string;
  }>;
};

const TYPED_LIMIT =
  /CreateDerivativeLimitOrderAuthz|create_derivative_limit_order_authz/i;

function sessionContext(session: Pick<GatewaySession, "policy" | "subaccountId">) {
  return {
    subaccountId: session.subaccountId,
    policyMarkets: session.policy?.marketIds ?? [],
  };
}

/**
 * Read-only: on-chain typed limit + cancel grants for session grantee match policy scope.
 */
export async function verifySessionGrantOnChain(params: {
  session: Pick<
    GatewaySession,
    | "granteeAddress"
    | "ownerInjectiveAddress"
    | "revoked"
    | "policy"
    | "subaccountId"
  >;
  network?: "testnet" | "mainnet";
}): Promise<SessionGrantStatus> {
  const granter = params.session.ownerInjectiveAddress;
  const grantee = params.session.granteeAddress;
  const issues: string[] = [];
  const { subaccountId, policyMarkets } = sessionContext(params.session);

  if (params.session.revoked) {
    issues.push("session revoked");
  }
  if (!granter?.startsWith("inj1")) {
    issues.push("session missing ownerInjectiveAddress — set at session create");
  }
  if (!grantee?.startsWith("inj1")) {
    issues.push("invalid grantee address on session");
  }
  if (!subaccountId) {
    issues.push("session missing subaccountId");
  }
  if (policyMarkets.length === 0) {
    issues.push("session policy has empty marketIds");
  }

  if (issues.length > 0) {
    return emptyStatus(granter ?? "", grantee, params.network ?? "testnet", issues);
  }

  const fetched = await fetchGranterGrants({
    granter: granter!,
    network: params.network ?? "testnet",
  });

  const forGrantee = fetched.grants.filter(
    (g) => g.grantee.toLowerCase() === grantee.toLowerCase(),
  );

  const typedLimit = forGrantee.filter((g) =>
    TYPED_LIMIT.test(g.authorizationType),
  );

  const onChainLimitScopes = typedLimit
    .filter((g) => g.subaccountId && g.marketIds?.length)
    .map((g) => ({
      subaccountId: g.subaccountId!,
      marketIds: g.marketIds!,
      expiration: g.expiration,
    }));

  if (forGrantee.length === 0) {
    issues.push(
      `no AuthZ grants from ${granter} to grantee ${grantee} — sign MsgGrant (GET /v1/sessions/…/grant-tx-plan)`,
    );
  } else if (typedLimit.length === 0 && forGrantee.length > 0) {
    issues.push(
      `grants exist for grantee but no CreateDerivativeLimitOrderAuthz — use typed grant plan, not GenericAuthorization`,
    );
  }

  const evaluated = evaluateTypedGrantsForSession({
    grantsForGrantee: forGrantee,
    expectedGrantee: grantee,
    subaccountId: subaccountId!,
    policyMarketIds: policyMarkets,
  });

  const allIssues = [...issues, ...evaluated.issues];
  const scopeMatch = evaluated.limitReady || evaluated.cancelReady;

  const ready =
    evaluated.ready &&
    !params.session.revoked &&
    !allIssues.some((i) => /GenericAuthorization/i.test(i));

  return {
    granter: granter!,
    grantee,
    network: fetched.network,
    ready,
    limitReady: evaluated.limitReady && !params.session.revoked,
    cancelReady: evaluated.cancelReady && !params.session.revoked,
    scopeMatch,
    matchingGrants: typedLimit.length,
    issues: allIssues,
    userFacingIssues: evaluated.userFacingIssues,
    endpoint: fetched.endpoint,
    grantsSummary: forGrantee.map((g) => ({
      authorizationType: g.authorizationType,
      expiration: g.expiration,
      subaccountId: g.subaccountId,
      marketIds: g.marketIds,
    })),
    onChainLimitScopes,
  };
}

function emptyStatus(
  granter: string,
  grantee: string,
  network: string,
  issues: string[],
): SessionGrantStatus {
  return {
    granter,
    grantee,
    network,
    ready: false,
    limitReady: false,
    cancelReady: false,
    scopeMatch: false,
    matchingGrants: 0,
    issues,
    userFacingIssues: issues.includes("session revoked")
      ? ["Application session ended."]
      : ["Wallet permission is not active yet."],
    endpoint: "",
    grantsSummary: [],
    onChainLimitScopes: [],
  };
}

/** Re-export for execute gate messaging. */
export { LIMIT_AUTHZ };
