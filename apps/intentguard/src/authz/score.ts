import type { GrantAuditReport, GrantRiskFinding } from "./types.ts";
import { DANGEROUS_MSG_TYPE_SUBSTRINGS } from "./types.ts";

export type RawGrant = {
  grantee: string;
  authorizationType: string;
  msgTypeUrl?: string;
  expiration?: string;
  subaccountId?: string;
  marketIds?: string[];
};

/**
 * Score existing AuthZ grants.
 * GenericAuthorization on trading msgs = high risk (no market/size).
 * Typed Create*OrderAuthz with markets + subaccount = better baseline (still no notional).
 */
export function scoreGrants(
  granter: string,
  grants: RawGrant[],
): GrantAuditReport {
  const findings: GrantRiskFinding[] = [];
  let score = 100;

  if (grants.length === 0) {
    findings.push({
      severity: "info",
      code: "no_grants",
      message: "No AuthZ grants found for this granter",
    });
    return { granter, grantCount: 0, score: 100, findings, grants: [] };
  }

  for (const g of grants) {
    const type = g.authorizationType;
    const msg = g.msgTypeUrl ?? "";

    if (/GenericAuthorization/i.test(type)) {
      findings.push({
        severity: "high",
        code: "generic_authorization",
        message: `GenericAuthorization to ${g.grantee} for ${msg || "unknown msg"} — any params allowed for that msg type`,
      });
      score -= 25;
    } else if (/Create\w+OrderAuthz|Cancel\w+OrderAuthz|BatchUpdateOrdersAuthz/i.test(type)) {
      const markets = g.marketIds ?? [];
      if (markets.length === 0) {
        findings.push({
          severity: "high",
          code: "typed_authz_empty_markets",
          message: `Typed AuthZ ${type} to ${g.grantee} has empty/unknown market_ids — treat as unsafe until verified on-chain`,
        });
        score -= 20;
      } else {
        findings.push({
          severity: "info",
          code: "typed_authz_scoped",
          message: `Typed AuthZ ${type} to ${g.grantee} scopes subaccount=${g.subaccountId ?? "?"} markets=${markets.join(",")}`,
        });
        findings.push({
          severity: "medium",
          code: "typed_authz_no_notional",
          message: `Typed AuthZ still has no max notional/leverage — IntentGuard gateway must enforce order economics`,
        });
        score -= 5;
      }
    }

    if (/GenericExchangeAuthorization/i.test(type)) {
      findings.push({
        severity: "high",
        code: "generic_exchange_authorization",
        message: `GenericExchangeAuthorization to ${g.grantee} — optional spend_limit only; no market/subaccount fields`,
      });
      score -= 20;
    }

    for (const danger of DANGEROUS_MSG_TYPE_SUBSTRINGS) {
      if (msg.includes(danger) || type.includes(danger)) {
        findings.push({
          severity: "critical",
          code: "dangerous_msg",
          message: `Grant may allow ${danger} to ${g.grantee}`,
        });
        score -= 40;
      }
    }

    if (!g.expiration) {
      findings.push({
        severity: "medium",
        code: "no_expiry",
        message: `Grant to ${g.grantee} has no expiry`,
      });
      score -= 10;
    } else {
      const exp = Date.parse(g.expiration);
      if (Number.isFinite(exp) && exp < Date.now()) {
        findings.push({
          severity: "info",
          code: "expired",
          message: `Grant to ${g.grantee} already expired at ${g.expiration}`,
        });
      } else if (Number.isFinite(exp) && exp - Date.now() > 30 * 86400_000) {
        findings.push({
          severity: "medium",
          code: "long_expiry",
          message: `Grant to ${g.grantee} expires far out (${g.expiration})`,
        });
        score -= 5;
      }
    }
  }

  score = Math.max(0, Math.min(100, score));
  return {
    granter,
    grantCount: grants.length,
    score,
    findings,
    grants,
  };
}
