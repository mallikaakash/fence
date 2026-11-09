import { fetchGranterGrants } from "./fetchGrants.ts";
import type { GatewaySession } from "../gateway/session.ts";

export type SessionGrantStatus = {
  granter: string;
  grantee: string;
  network: string;
  /** True when typed CreateDerivativeLimitOrderAuthz exists for this grantee. */
  ready: boolean;
  matchingGrants: number;
  issues: string[];
  endpoint: string;
  grantsSummary: Array<{
    authorizationType: string;
    expiration?: string;
  }>;
};

const TYPED_LIMIT =
  /CreateDerivativeLimitOrderAuthz|create_derivative_limit_order_authz/i;

/**
 * Read-only: does the owner granter have an on-chain typed limit grant for this session grantee?
 */
export async function verifySessionGrantOnChain(params: {
  session: Pick<
    GatewaySession,
    "granteeAddress" | "ownerInjectiveAddress" | "revoked"
  >;
  network?: "testnet" | "mainnet";
}): Promise<SessionGrantStatus> {
  const granter = params.session.ownerInjectiveAddress;
  const grantee = params.session.granteeAddress;
  const issues: string[] = [];

  if (params.session.revoked) {
    issues.push("session revoked");
  }
  if (!granter?.startsWith("inj1")) {
    issues.push("session missing ownerInjectiveAddress — set at session create");
  }
  if (!grantee?.startsWith("inj1")) {
    issues.push("invalid grantee address on session");
  }

  if (issues.length > 0) {
    return {
      granter: granter ?? "",
      grantee,
      network: params.network ?? "testnet",
      ready: false,
      matchingGrants: 0,
      issues,
      endpoint: "",
      grantsSummary: [],
    };
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

  if (forGrantee.length === 0) {
    issues.push(
      `no AuthZ grants from ${granter} to grantee ${grantee} — sign MsgGrant from session grantPlan`,
    );
  } else if (typedLimit.length === 0) {
    issues.push(
      `grants exist for grantee but no CreateDerivativeLimitOrderAuthz — use typed grant plan, not GenericAuthorization`,
    );
  }

  const expiring = typedLimit.filter((g) => {
    if (!g.expiration) return false;
    const t = Date.parse(g.expiration);
    return Number.isFinite(t) && t < Date.now();
  });
  if (expiring.length > 0) {
    issues.push("typed limit grant expired — re-grant or extend expiry");
  }

  return {
    granter: granter!,
    grantee,
    network: fetched.network,
    ready: typedLimit.length > 0 && issues.length === 0,
    matchingGrants: typedLimit.length,
    issues,
    endpoint: fetched.endpoint,
    grantsSummary: forGrantee.map((g) => ({
      authorizationType: g.authorizationType,
      expiration: g.expiration,
    })),
  };
}
