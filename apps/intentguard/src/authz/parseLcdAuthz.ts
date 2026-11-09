import { CreateDerivativeLimitOrderAuthz } from "@injectivelabs/core-proto-ts-v2/generated/injective/exchange/v1beta1/authz_pb.js";
import { CancelDerivativeOrderAuthz } from "@injectivelabs/core-proto-ts-v2/generated/injective/exchange/v1beta1/authz_pb.js";
import { TYPED_EXCHANGE_AUTHZ } from "./types.ts";

export type ParsedAuthzScope = {
  authorizationType: string;
  subaccountId?: string;
  marketIds?: string[];
};

function normHex(id: string): string {
  return id.toLowerCase().replace(/^0x/, "");
}

function bytesFromAuthValue(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string" && value.length > 0) {
    try {
      return Buffer.from(value, "base64");
    } catch {
      return null;
    }
  }
  return null;
}

/** Parse Injective LCD grant authorization (JSON @type or protobuf Any). */
export function parseLcdAuthorization(
  authorization: Record<string, unknown> | undefined,
): ParsedAuthzScope | null {
  if (!authorization) return null;

  const typeUrl = String(
    authorization["@type"] ??
      authorization.typeUrl ??
      authorization.type_url ??
      "unknown",
  );

  const jsonSub = authorization.subaccount_id ?? authorization.subaccountId;
  const jsonMarkets = authorization.market_ids ?? authorization.marketIds;
  if (jsonSub && Array.isArray(jsonMarkets)) {
    return {
      authorizationType: typeUrl,
      subaccountId: String(jsonSub),
      marketIds: jsonMarkets.map(String),
    };
  }

  const bytes = bytesFromAuthValue(authorization.value);
  if (!bytes) {
    return { authorizationType: typeUrl };
  }

  try {
    if (typeUrl.includes("CreateDerivativeLimitOrderAuthz")) {
      const decoded = CreateDerivativeLimitOrderAuthz.fromBinary(bytes);
      return {
        authorizationType: typeUrl,
        subaccountId: decoded.subaccountId,
        marketIds: [...decoded.marketIds],
      };
    }
    if (typeUrl.includes("CancelDerivativeOrderAuthz")) {
      const decoded = CancelDerivativeOrderAuthz.fromBinary(bytes);
      return {
        authorizationType: typeUrl,
        subaccountId: decoded.subaccountId,
        marketIds: [...decoded.marketIds],
      };
    }
  } catch {
    return { authorizationType: typeUrl };
  }

  return { authorizationType: typeUrl };
}

export function marketIdsCoverPolicy(
  grantMarkets: string[],
  policyMarkets: string[],
): boolean {
  const granted = new Set(grantMarkets.map((m) => normHex(m)));
  return policyMarkets.every((m) => granted.has(normHex(m)));
}

export function subaccountsMatch(a: string, b: string): boolean {
  return normHex(a) === normHex(b);
}

export const LIMIT_AUTHZ = TYPED_EXCHANGE_AUTHZ.CreateDerivativeLimitOrderAuthz;
