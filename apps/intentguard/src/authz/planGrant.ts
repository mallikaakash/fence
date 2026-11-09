import type { IntentGuardPolicy } from "../policy/types.ts";
import {
  HUMMINGBOT_TYPED_MSG,
  TYPED_EXCHANGE_AUTHZ,
  V0_TRADING_MSG_TYPES,
} from "./types.ts";

/** One typed AuthZ grant IntentGuard wants the owner to sign (Route A). */
export type TypedAuthzGrantSpec = {
  /** Hummingbot / pyinjective composer msg_type string. */
  composerMsgType: string;
  /** Full protobuf type URL for the Authorization. */
  authorizationTypeUrl: string;
  /** Msg type this authorization covers. */
  msgTypeUrl: string;
  subaccountId: string;
  marketIds: string[];
};

export type GrantPlan = {
  mode: "typed_exchange_authz";
  granteeAddress: string;
  /** Dedicated trading subaccount the grant is scoped to. */
  subaccountId: string;
  marketIds: string[];
  expirySeconds: number;
  /** Typed grants to construct (not GenericAuthorization). */
  typedGrants: TypedAuthzGrantSpec[];
  /** Msg type URLs covered by typedGrants (for UI). */
  msgTypes: string[];
  warnings: string[];
  notes: string[];
  /**
   * Rules AuthZ cannot encode — IntentGuard gateway / signer must enforce.
   * Typed AuthZ has no max notional / leverage / cumulative loss fields.
   */
  gatewayEnforced: string[];
  /**
   * Honest security claim for docs / pitch.
   */
  defensibleClaim: string;
};

function requireNonEmptyMarkets(marketIds: string[]): string[] {
  const cleaned = marketIds.map((m) => m.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    throw new Error(
      "typed AuthZ plan refused: empty marketIds (empty list must not mean 'all markets')",
    );
  }
  return cleaned;
}

function requireSubaccountId(subaccountId: string): string {
  const id = subaccountId.trim();
  if (!id) {
    throw new Error("typed AuthZ plan refused: subaccountId is required");
  }
  return id;
}

/**
 * Build a Route A grant plan: typed exchange AuthZ with market + subaccount scope.
 *
 * Does NOT emit GenericAuthorization. Stock AutoSign's authz_grant interface is
 * insufficient — construct these grants directly (Hummingbot msg_grant_typed pattern).
 */
export function planTradingGrant(params: {
  granteeAddress: string;
  policy: IntentGuardPolicy;
  /** Full subaccount id (40-byte hex / injective subaccount id string). */
  subaccountId: string;
  expirySeconds?: number;
  /** Include cancel grant (default true). */
  includeCancel?: boolean;
}): GrantPlan {
  const marketIds = requireNonEmptyMarkets(params.policy.marketIds);
  const subaccountId = requireSubaccountId(params.subaccountId);
  const warnings: string[] = [];
  const notes: string[] = [];

  warnings.push(
    "Official Injective MCP autosign / authz_grant uses GenericAuthorization (msg type + expiry only). IntentGuard constructs typed Create*OrderAuthz instead.",
  );
  warnings.push(
    "Typed AuthZ does not encode max notional, quantity, leverage, or cumulative loss — gateway must enforce those before signing MsgExec.",
  );
  warnings.push(
    "Funding a subaccount caps collateral, not order notional. Perps can still lever beyond deposit — set maxOrderNotional / maxMarginPerOrder in policy.",
  );

  notes.push(`On-chain market allowlist: ${marketIds.join(", ")}`);
  notes.push(`On-chain subaccount lock: ${subaccountId}`);
  notes.push(
    `Gateway: maxMarginPerOrder=${params.policy.maxMarginPerOrder}` +
      (params.policy.maxOrderNotional
        ? `, maxOrderNotional=${params.policy.maxOrderNotional}`
        : "") +
      `, maxLeverage=${params.policy.maxLeverage}, dailyBudget=${params.policy.dailyMarginBudget}`,
  );
  notes.push(
    "v0 grants: derivative limit create + cancel only. No market orders, batch updates, margin adds, or bank sends.",
  );
  notes.push(
    "Pattern reference: Hummingbot account_delegation_script.py msg_grant_typed(CreateDerivativeMarketOrderAuthz / BatchUpdateOrdersAuthz).",
  );

  const typedGrants: TypedAuthzGrantSpec[] = [
    {
      composerMsgType: HUMMINGBOT_TYPED_MSG.CreateDerivativeLimitOrderAuthz,
      authorizationTypeUrl: TYPED_EXCHANGE_AUTHZ.CreateDerivativeLimitOrderAuthz,
      msgTypeUrl: V0_TRADING_MSG_TYPES[0],
      subaccountId,
      marketIds: [...marketIds],
    },
  ];

  if (params.includeCancel !== false) {
    typedGrants.push({
      composerMsgType: HUMMINGBOT_TYPED_MSG.CancelDerivativeOrderAuthz,
      authorizationTypeUrl: TYPED_EXCHANGE_AUTHZ.CancelDerivativeOrderAuthz,
      msgTypeUrl: V0_TRADING_MSG_TYPES[1],
      subaccountId,
      marketIds: [...marketIds],
    });
  }

  return {
    mode: "typed_exchange_authz",
    granteeAddress: params.granteeAddress,
    subaccountId,
    marketIds: [...marketIds],
    expirySeconds: params.expirySeconds ?? 60 * 60 * 24,
    typedGrants,
    msgTypes: typedGrants.map((g) => g.msgTypeUrl),
    warnings,
    notes,
    gatewayEnforced: [
      "per-order notional (price × quantity) when provided",
      "max margin per order",
      "max leverage",
      "daily margin budget",
      "policy expiry",
      "agent never holds grantee MsgExec key",
      "no generic sign(bytes) surface",
    ],
    defensibleClaim:
      "An agent without the grantee signing key and without an alternate signing route cannot independently MsgExec under the owner's grant; market IDs and subaccount are also checked on-chain. Notional and leverage depend on gateway/signer integrity.",
  };
}
