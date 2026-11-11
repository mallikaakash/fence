import { MsgGrant } from "@injectivelabs/sdk-ts";
import type { GrantPlan } from "./planGrant.ts";
import { CreateDerivativeLimitOrderAuthz } from "@injectivelabs/core-proto-ts-v2/generated/injective/exchange/v1beta1/authz_pb.js";
import { CancelDerivativeOrderAuthz } from "@injectivelabs/core-proto-ts-v2/generated/injective/exchange/v1beta1/authz_pb.js";
import { TYPED_EXCHANGE_AUTHZ } from "./types.ts";

function packLimit(subaccountId: string, marketIds: string[]) {
  return {
    typeUrl: TYPED_EXCHANGE_AUTHZ.CreateDerivativeLimitOrderAuthz,
    value: CreateDerivativeLimitOrderAuthz.toBinary(
      CreateDerivativeLimitOrderAuthz.create({ subaccountId, marketIds }),
    ),
  };
}

function packCancel(subaccountId: string, marketIds: string[]) {
  return {
    typeUrl: TYPED_EXCHANGE_AUTHZ.CancelDerivativeOrderAuthz,
    value: CancelDerivativeOrderAuthz.toBinary(
      CancelDerivativeOrderAuthz.create({ subaccountId, marketIds }),
    ),
  };
}

/** Unsigned MsgGrant payloads for owner wallet / `grant:broadcast`. */
export function buildGrantTxPlan(params: {
  granter: string;
  grantee: string;
  plan: Pick<
    GrantPlan,
    "subaccountId" | "marketIds" | "expirySeconds" | "typedGrants"
  >;
}): {
  expirationUnix: number;
  expirationIso: string;
  msgGrants: unknown[];
  spikeCliHint: string;
} {
  const expirySeconds = params.plan.expirySeconds;
  if (expirySeconds == null || !Number.isFinite(expirySeconds) || expirySeconds < 1) {
    throw new Error("buildGrantTxPlan requires explicit expirySeconds on grant plan");
  }
  const expirationUnix = Math.floor(Date.now() / 1000) + Math.floor(expirySeconds);
  const { subaccountId, marketIds } = params.plan;

  const msgGrantInputs = [
    {
      granter: params.granter,
      grantee: params.grantee,
      authorization: packLimit(subaccountId, marketIds),
      expiration: expirationUnix,
    },
    {
      granter: params.granter,
      grantee: params.grantee,
      authorization: packCancel(subaccountId, marketIds),
      expiration: expirationUnix,
    },
  ] as const;

  const msgs = msgGrantInputs.map((input) => MsgGrant.fromJSON(input));

  return {
    expirationUnix,
    expirationIso: new Date(expirationUnix * 1000).toISOString(),
    /** Flat `MsgGrant.fromJSON` inputs — not `toJSON()` strings (breaks Keplr broadcast). */
    msgGrants: [...msgGrantInputs],
    spikeCliHint:
      "Or funded testnet owner: npm run grant:broadcast -- /tmp/ig-session.json",
  };
}
