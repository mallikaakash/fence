import { fetchGranterGrants } from "./fetchGrants.ts";
import type { GatewaySession } from "../gateway/session.ts";
import type { IntentGuardPolicy } from "../policy/types.ts";
import {
  LIMIT_AUTHZ,
  marketIdsCoverPolicy,
  subaccountsMatch,
} from "./parseLcdAuthz.ts";

export type SessionGrantStatus = {
  granter: string;
  grantee: string;
  network: string;
  /** Typed limit grant exists, not expired, markets + subaccount match session. */
  ready: boolean;
  scopeMatch: boolean;
  matchingGrants: number;
  issues: string[];
  endpoint: string;
  grantsSummary: Array<{
    authorizationType: string;
    expiration?: string;
    subaccountId?: string;
    marketIds?: string[];
  }>;
  /** On-chain limit-order scopes for this grantee (for owner UI). */
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
 * Read-only: on-chain typed limit grant for session grantee matches policy scope.
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
  } else if (typedLimit.length === 0) {
    issues.push(
      `grants exist for grantee but no CreateDerivativeLimitOrderAuthz — use typed grant plan, not GenericAuthorization`,
    );
  }

  const expired = typedLimit.filter((g) => {
    if (!g.expiration) return false;
    const t = Date.parse(g.expiration);
    return Number.isFinite(t) && t < Date.now();
  });

  let scopeMatch = false;
  const activeLimit = typedLimit.filter((g) => {
    if (!g.expiration) return true;
    const t = Date.parse(g.expiration);
    return !Number.isFinite(t) || t >= Date.now();
  });

  for (const g of typedLimit) {
    if (!g.subaccountId || !g.marketIds?.length) {
      issues.push(
        "typed limit grant missing subaccount_id or market_ids in LCD — re-grant with IntentGuard plan",
      );
      continue;
    }
    if (!subaccountsMatch(g.subaccountId, subaccountId!)) {
      issues.push(
        `on-chain subaccount ${g.subaccountId} != session ${subaccountId}`,
      );
      continue;
    }
    if (!marketIdsCoverPolicy(g.marketIds, policyMarkets)) {
      const missing = policyMarkets.filter(
        (m) =>
          !g.marketIds!.some(
            (x) => x.toLowerCase() === m.toLowerCase(),
          ),
      );
      issues.push(
        `grant markets do not cover session policy markets: missing ${missing.join(", ")}`,
      );
      continue;
    }
    scopeMatch = true;
    break;
  }

  if (typedLimit.length > 0 && !scopeMatch) {
    issues.push("no limit grant matches session subaccount + marketIds");
  }

  if (scopeMatch && activeLimit.length === 0 && expired.length > 0) {
    issues.push("typed limit grant expired — re-grant or extend expiry");
  }

  const ready =
    scopeMatch &&
    activeLimit.length > 0 &&
    !issues.some((i) => /no AuthZ|GenericAuthorization/i.test(i));

  return {
    granter: granter!,
    grantee,
    network: fetched.network,
    ready,
    scopeMatch,
    matchingGrants: typedLimit.length,
    issues,
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
    scopeMatch: false,
    matchingGrants: 0,
    issues,
    endpoint: "",
    grantsSummary: [],
    onChainLimitScopes: [],
  };
}

/** Re-export for execute gate messaging. */
export { LIMIT_AUTHZ };
