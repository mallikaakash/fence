import type { RawGrant } from "./score.ts";
import { marketIdsCoverPolicy, subaccountsMatch } from "./parseLcdAuthz.ts";

export type TypedGrantEvaluation = {
  ready: boolean;
  limitReady: boolean;
  cancelReady: boolean;
  issues: string[];
  userFacingIssues: string[];
};

const TYPED_LIMIT =
  /CreateDerivativeLimitOrderAuthz|create_derivative_limit_order_authz/i;
const TYPED_CANCEL =
  /CancelDerivativeOrderAuthz|cancel_derivative_order_authz/i;

/** Reject generic or stock Msg grants that are not typed exchange authorizations. */
const UNTYPED_AUTHZ = /GenericAuthorization|generic/i;

function isActiveGrant(g: RawGrant): boolean {
  if (!g.expiration) return true;
  const t = Date.parse(g.expiration);
  return !Number.isFinite(t) || t >= Date.now();
}

function grantMatchesSessionScope(
  g: RawGrant,
  subaccountId: string,
  policyMarkets: string[],
): { ok: boolean; issue?: string } {
  if (!g.subaccountId || !g.marketIds?.length) {
    return {
      ok: false,
      issue: "typed grant missing subaccount or markets in LCD",
    };
  }
  if (!subaccountsMatch(g.subaccountId, subaccountId)) {
    return {
      ok: false,
      issue: `on-chain subaccount ${g.subaccountId} != session ${subaccountId}`,
    };
  }
  if (!marketIdsCoverPolicy(g.marketIds, policyMarkets)) {
    const missing = policyMarkets.filter(
      (m) =>
        !g.marketIds!.some((x) => x.toLowerCase() === m.toLowerCase()),
    );
    return {
      ok: false,
      issue: `grant markets do not cover policy: missing ${missing.join(", ")}`,
    };
  }
  return { ok: true };
}

function evaluateRole(
  grants: RawGrant[],
  subaccountId: string,
  policyMarkets: string[],
  kind: "limit" | "cancel",
): { ready: boolean; issues: string[] } {
  const pattern = kind === "limit" ? TYPED_LIMIT : TYPED_CANCEL;
  const typed = grants.filter(
    (g) =>
      pattern.test(g.authorizationType) &&
      !UNTYPED_AUTHZ.test(g.authorizationType),
  );
  const issues: string[] = [];

  const genericOnly = grants.some((g) => UNTYPED_AUTHZ.test(g.authorizationType));
  if (genericOnly && typed.length === 0) {
    issues.push("untyped or generic wallet permission found — not accepted");
  }

  if (typed.length === 0) {
    issues.push(
      kind === "limit"
        ? "missing place-order wallet permission"
        : "missing cancel-order wallet permission",
    );
    return { ready: false, issues };
  }

  const active = typed.filter(isActiveGrant);
  if (active.length === 0) {
    issues.push(
      kind === "limit"
        ? "place-order permission expired"
        : "cancel-order permission expired",
    );
    return { ready: false, issues };
  }

  let scopeOk = false;
  for (const g of typed) {
    const m = grantMatchesSessionScope(g, subaccountId, policyMarkets);
    if (!m.ok) {
      if (m.issue) issues.push(m.issue);
      continue;
    }
    if (isActiveGrant(g)) {
      scopeOk = true;
      break;
    }
  }

  if (!scopeOk) {
    issues.push(
      kind === "limit"
        ? "no active place-order permission for your markets"
        : "no active cancel-order permission for your markets",
    );
  }

  return { ready: scopeOk, issues };
}

export function evaluateTypedGrantsForSession(params: {
  grantsForGrantee: RawGrant[];
  expectedGrantee?: string;
  subaccountId: string;
  policyMarketIds: string[];
}): TypedGrantEvaluation {
  let grants = params.grantsForGrantee;
  if (params.expectedGrantee) {
    const want = params.expectedGrantee.toLowerCase();
    grants = grants.filter((g) => g.grantee.toLowerCase() === want);
  }

  const { subaccountId, policyMarketIds } = params;
  const limit = evaluateRole(grants, subaccountId, policyMarketIds, "limit");
  const cancel = evaluateRole(grants, subaccountId, policyMarketIds, "cancel");

  const issues = [...limit.issues, ...cancel.issues];
  const userFacingIssues: string[] = [];

  if (!limit.ready) {
    if (limit.issues.some((i) => /missing place-order/.test(i))) {
      userFacingIssues.push(
        "Place-order permission is not on-chain yet (Keplr approval still required).",
      );
    } else if (limit.issues.some((i) => /expired/.test(i))) {
      userFacingIssues.push("Place-order permission has expired.");
    } else if (limit.issues.some((i) => /generic/.test(i))) {
      userFacingIssues.push(
        "Overly broad wallet permission detected — use IntentGuard typed setup.",
      );
    } else {
      userFacingIssues.push(
        "Place-order permission does not match your selected markets or subaccount.",
      );
    }
  }
  if (!cancel.ready) {
    if (cancel.issues.some((i) => /missing cancel-order/.test(i))) {
      userFacingIssues.push(
        "Cancel-order permission is missing — setup is incomplete.",
      );
    } else if (cancel.issues.some((i) => /expired/.test(i))) {
      userFacingIssues.push("Cancel-order permission has expired.");
    } else if (!limit.issues.some((i) => /missing/.test(i))) {
      userFacingIssues.push(
        "Cancel-order permission does not match your selected markets or subaccount.",
      );
    }
  }

  const ready = limit.ready && cancel.ready;

  return {
    ready,
    limitReady: limit.ready,
    cancelReady: cancel.ready,
    issues,
    userFacingIssues: ready ? [] : userFacingIssues,
  };
}
