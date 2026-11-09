import type { RawGrant } from "./score.ts";
import { parseLcdAuthorization } from "./parseLcdAuthz.ts";

export type FetchGrantsResult = {
  network: string;
  endpoint: string;
  grants: RawGrant[];
};

/**
 * Read-only LCD fetch of AuthZ grants by granter.
 * Uses public REST; no keys required.
 */
export async function fetchGranterGrants(params: {
  granter: string;
  /** Default Injective testnet LCD */
  restUrl?: string;
  network?: string;
}): Promise<FetchGrantsResult> {
  const network = params.network ?? "testnet";
  const restUrl =
    params.restUrl ??
    (network === "mainnet"
      ? "https://sentry.lcd.injective.network"
      : "https://testnet.sentry.lcd.injective.network");

  const url = `${restUrl.replace(/\/$/, "")}/cosmos/authz/v1beta1/grants/granter/${params.granter}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`AuthZ LCD ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as {
    grants?: Array<{
      granter?: string;
      grantee?: string;
      authorization?: { typeUrl?: string; type_url?: string; value?: unknown };
      expiration?: string;
    }>;
  };

  const grants: RawGrant[] = (body.grants ?? []).map((g) => {
    const parsed = parseLcdAuthorization(
      g.authorization as Record<string, unknown> | undefined,
    );
    const typeUrl = parsed?.authorizationType ?? "unknown";
    return {
      grantee: g.grantee ?? "",
      authorizationType: typeUrl,
      msgTypeUrl: undefined,
      expiration: g.expiration,
      subaccountId: parsed?.subaccountId,
      marketIds: parsed?.marketIds,
    };
  });

  return { network, endpoint: url, grants };
}
