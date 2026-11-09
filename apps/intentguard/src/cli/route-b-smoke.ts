#!/usr/bin/env node
/**
 * Route B probe: Exchange Precompile exists on Injective EVM testnet (0x…65).
 * Full Policy Vault contract deployment is roadmap — this smoke verifies infrastructure.
 *
 *   npm run route-b:smoke
 */
const TESTNET_EVM_RPC =
  process.env.INJECTIVE_EVM_RPC ??
  "https://k8s.testnet.json-rpc.injective.network/";
const EXCHANGE_PRECOMPILE = "0x0000000000000000000000000000000000000065";

async function ethRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(TESTNET_EVM_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`EVM RPC ${res.status}`);
  const body = (await res.json()) as {
    result?: T;
    error?: { message: string };
  };
  if (body.error) throw new Error(body.error.message);
  return body.result as T;
}

async function main() {
  console.log("Exchange Precompile (Route B target)");
  console.log("  address", EXCHANGE_PRECOMPILE);
  console.log("  rpc    ", TESTNET_EVM_RPC);

  const blockHex = await ethRpc<string>("eth_blockNumber", []);
  const block = Number.parseInt(blockHex, 16);
  const code = await ethRpc<string>("eth_getCode", [EXCHANGE_PRECOMPILE, "latest"]);

  console.log("  block  ", block);
  console.log(
    "  code   ",
    code === "0x"
      ? "0x (expected — system precompile, not contract bytecode)"
      : `${code.slice(0, 66)}…`,
  );

  const rpcOk = Number.isFinite(block) && block > 0;
  console.log(rpcOk ? "PASS Injective EVM testnet reachable" : "FAIL EVM RPC");

  console.log(`
Next (Route B): deploy IntentGuardPolicyVault — see contracts/IntentGuardPolicyVault.sol
Agent EOA calls vault; vault enforces policy then invokes precompile 0x65.
Route A remains baseline until vault non-bypass is proven on testnet.
`);

  process.exit(rpcOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
