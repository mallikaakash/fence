# Route B — Exchange Precompile Policy Vault

**Status:** Smoke only (`npm run route-b:smoke`). **Route A** remains the shipped security path.

## Why

Route A enforces notional in the gateway (off-chain integrity). Route B would encode allowlist + notional in Solidity, then call the Exchange Precompile [`0x65`](https://docs.injective.network/developers-evm/exchange-precompile) so policy and exchange action share one EVM transaction.

## Smoke (done / automated)

```bash
cd apps/intentguard
npm run route-b:smoke
```

Verifies Injective EVM testnet JSON-RPC (`eth_blockNumber`). Exchange precompile `0x65` returns `eth_getCode: 0x` — native precompile, not deployed Solidity.

## Contract skeleton

`apps/intentguard/contracts/IntentGuardPolicyVault.sol` — agent allowlist, market allowlist, notional check; precompile bridge **not** wired (reverts by design until ABI spike).

## Promotion criteria (from INTENTGUARD-SPIKE.md)

Promote Route B only if:

- Agent cannot call `0x65` as the funded exchange account without going through the vault.
- On-chain policy is strictly stronger than gateway-only notional (testnet proof).

Otherwise: ship Route A, document B as roadmap.

## References

- [Precompiles](https://docs.injective.network/developers-evm/precompiles)
- [InjectiveLabs/solidity-contracts](https://github.com/InjectiveLabs/solidity-contracts)
