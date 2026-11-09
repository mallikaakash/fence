import { TESTNET_FAUCET_URL, createBankApi } from "./network.ts";

export async function requestTestnetInj(address: string): Promise<{
  queued: boolean;
  status: number;
  body: string;
}> {
  const res = await fetch(TESTNET_FAUCET_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const body = await res.text();
  return { queued: res.ok, status: res.status, body };
}

export async function getInjBalance(address: string): Promise<string> {
  const bank = createBankApi();
  const balances = await bank.fetchBalances(address);
  const inj = balances.balances?.find((b: { denom: string }) => b.denom === "inj");
  return inj?.amount ?? "0";
}

export async function waitForInjBalance(
  address: string,
  opts: { minAmount?: bigint; timeoutMs?: number; pollMs?: number } = {},
): Promise<{ amount: string; funded: boolean }> {
  const minAmount = opts.minAmount ?? 1n;
  const timeoutMs = opts.timeoutMs ?? 12 * 60_000;
  const pollMs = opts.pollMs ?? 15_000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const amount = await getInjBalance(address);
      if (BigInt(amount) >= minAmount) {
        return { amount, funded: true };
      }
    } catch {
      // account may not exist yet
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  const amount = await getInjBalance(address).catch(() => "0");
  return { amount, funded: BigInt(amount) >= minAmount };
}
