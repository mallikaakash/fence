import {
  createBankApiForNetwork,
  lcdRestBaseUrl,
} from "./network.ts";
import {
  fetchWithTimeout,
  readinessQueryTimeoutMs,
  withQueryTimeout,
} from "./queryTimeout.ts";

export const NATIVE_INJ_DENOM = "inj";

/** Default minimum grantee INJ (18 decimals) — ~0.2 INJ, overridable via env. */
export function minGranteeInjAmountWei(): bigint {
  const raw = process.env.INTENTGUARD_READINESS_MIN_GRANTEE_INJ ?? "0.2";
  const human = Number(raw);
  if (!Number.isFinite(human) || human <= 0) {
    return 200_000_000_000_000_000n;
  }
  return BigInt(Math.round(human * 1e18));
}

export function formatInjHuman(amountWei: bigint): string {
  const whole = amountWei / 10n ** 18n;
  const frac = amountWei % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : String(whole);
}

/** Parse chain bank amount strings safely (integer base units only). */
export function parseInjAmountWei(amount: string | undefined): bigint | null {
  if (amount === undefined || amount === "") return 0n;
  if (!/^\d+$/.test(amount)) return null;
  try {
    return BigInt(amount);
  } catch {
    return null;
  }
}

export type InjBalanceQuery =
  | {
      status: "ok";
      amount: string;
      amountWei: bigint;
      source: "grpc" | "lcd";
      endpoint?: string;
    }
  | {
      status: "unavailable";
      error: string;
      endpoint?: string;
    };

/**
 * Read-only INJ bank balance for an inj1 address.
 * Tries chain gRPC first, then Cosmos bank LCD (same network).
 */
export async function queryInjBalance(params: {
  address: string;
  network?: "testnet" | "mainnet";
  timeoutMs?: number;
}): Promise<InjBalanceQuery> {
  const network = params.network ?? "testnet";
  const timeoutMs = params.timeoutMs ?? readinessQueryTimeoutMs();

  try {
    const injWei = await withQueryTimeout("bank.grpc", timeoutMs, async () => {
      const bank = createBankApiForNetwork(network);
      const balances = await bank.fetchBalances(params.address);
      const inj = balances.balances?.find(
        (b: { denom: string }) => b.denom === NATIVE_INJ_DENOM,
      );
      const amount = inj?.amount ?? "0";
      const parsed = parseInjAmountWei(amount);
      if (parsed === null) {
        throw new Error(`malformed inj amount from gRPC: ${amount}`);
      }
      return { amount, amountWei: parsed };
    });
    return {
      status: "ok",
      amount: injWei.amount,
      amountWei: injWei.amountWei,
      source: "grpc",
    };
  } catch (grpcErr) {
    const rest = lcdRestBaseUrl(network);
    const url = `${rest.replace(/\/$/, "")}/cosmos/bank/v1beta1/balances/${params.address}`;
    try {
      const res = await fetchWithTimeout(url, { timeoutMs });
      if (!res.ok) {
        return {
          status: "unavailable",
          error: `bank LCD ${res.status}`,
          endpoint: url,
        };
      }
      const body = (await res.json()) as {
        balances?: Array<{ denom?: string; amount?: string }>;
      };
      const inj = body.balances?.find((b) => b.denom === NATIVE_INJ_DENOM);
      const amount = inj?.amount ?? "0";
      const parsed = parseInjAmountWei(amount);
      if (parsed === null) {
        return {
          status: "unavailable",
          error: `malformed inj amount from LCD: ${amount}`,
          endpoint: url,
        };
      }
      return {
        status: "ok",
        amount,
        amountWei: parsed,
        source: "lcd",
        endpoint: url,
      };
    } catch (lcdErr) {
      const msg =
        lcdErr instanceof Error ? lcdErr.message : String(lcdErr);
      return {
        status: "unavailable",
        error: `bank query failed (grpc: ${String(grpcErr)}; lcd: ${msg})`,
        endpoint: url,
      };
    }
  }
}
