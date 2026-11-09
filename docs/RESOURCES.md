# Official Injective resources → IntentGuard usage

Source: Injective Discord “Documentations, SDKs & Other resources” list.  
Audit date: 9 Nov 2026. **Use what advances Route A (typed AuthZ + isolated signer + policy); skip infra that does not.**

| Resource | IntentGuard status | How we use it |
|----------|-------------------|---------------|
| [Injective Labs GitHub](https://github.com/InjectiveLabs) | **In use** | `vendor/mcp-server`, agent-skills, solidity-contracts (Route B), proto AuthZ |
| [Injective Documentation](https://docs.injective.network/) | **In use** | Docs MCP `search_injective_docs`; AuthZ / exchange / EVM precompile / trading-account |
| [Injective Trading Documentation](https://docs.trading.injective.network/) | **In use (read)** | FBA, fees, margin, order types; guides demo claims (not CEX) |
| [Injective API Documentation](https://api.injective.exchange/) | **Partial → wire** | Indexer RPCs for post-trade verify (orders, subaccount balances, portfolio) |
| [Injective TypeScript SDK Docs](https://docs.ts.injective.network/) | **In use** | `@injectivelabs/sdk-ts` MsgGrant / MsgExec / MsgDeposit / order helpers |
| [sdk-python examples](https://github.com/InjectiveLabs/sdk-python/tree/master/examples) | **Reference** | Typed grants via Hummingbot/`msg_grant_typed` pattern (Python ecosystem) |
| [sdk-go examples](https://github.com/InjectiveLabs/sdk-go/tree/master/examples) | **Reference** | Chain AuthZ + exchange examples; confirm typed AuthZ encoding |
| [Injective Integration Wiki](https://injective.notion.site/Injective-Integration-Wiki-51f27c594c5c4f0eaae33f4aa6ddc51e) | **Reference** | Integration patterns; cross-check endpoints & account models |
| [Injective Venture Group](https://injective.com/venturegroup) | **GTM only** | Design-partner / post-hackathon path — not engineering |
| [Injective IBC Relayers](https://injective.notion.site/Injective-IBC-Relayers-e2fc91e98d4642a4a4d5e7a97cd0374e) | **Out of scope** | Bridging not required for IntentGuard v0 |
| [Injective APIs (Notion)](https://injective.notion.site/Injective-APIs-525b20fdcfa945c0bae275782e900f27) | **Reference** | Endpoint inventory alongside `api.injective.exchange` |
| [Node Setup Guide](https://injective.notion.site/Injective-Exchange-Service-Setup-Guide-7e59980634d54991862300670583d46a) | **Out of scope** | We use public testnet / Sentry, not self-hosted exchange |
| [Node Operator Resources](https://injective.notion.site/Node-Operators-297159169099475eb2613b094fbee225) | **Out of scope** | Validator ops |

## Critical doc corrections we already applied

### 1. Default subaccount (index 0) ≠ deposit target

Official [Trading Account](https://docs.injective.network/developers/concepts/trading-account):

> Starting the v1.10.0 chain upgrade, the Bank balance and the default trading account (at nonce = 0) will be merged and the Bank funds will be directly used when executing trades originating from the default trading account.

That is why `MsgDeposit` to index `0` fails with `subaccount id is not valid`.  
**IntentGuard uses subaccount index `1` for isolated strategy collateral** (`TRADING_SUBACCOUNT_INDEX`).

### 2. Official TS AuthZ examples ≠ typed exchange AuthZ

[docs AuthZ examples](https://docs.injective.network/developers-native/examples/authz) and public AutoSign/MCP use **GenericAuthorization** (message type only).

Typed structs (`CreateDerivativeLimitOrderAuthz` with `subaccount_id` + `market_ids[]`) come from exchange protos + Python/`msg_grant_typed` (Hummingbot).  
IntentGuard constructs those Anys and broadcasts via `MsgGrant` **direct-sign** (sdk-ts amino path only supports GenericAuthorization).

### 3. FeeGrant

Docs: [`MsgGrantAllowance`](https://docs.injective.network/developers-native/examples/feegrant).  
IntentGuard: prefund grantee INJ in spike; optional owner FeeGrant via CLI — [FEEGRANT.md](./FEEGRANT.md).

## Code map

| Concern | Module |
|---------|--------|
| Typed grant / revoke | `apps/intentguard/src/chain/typedGrant.ts` |
| MsgExec limit order | `apps/intentguard/src/chain/msgExec.ts` |
| Policy + isolated sign + broadcast | `apps/intentguard/src/chain/liveExec.ts` |
| Deposit (index 1) | `apps/intentguard/src/chain/deposit.ts` |
| Indexer post-trade check | `apps/intentguard/src/chain/verify.ts` |
| Live spike CLIs | `npm run spike`, `npm run spike:notional` |

## What we are not forcing into v0

- Self-hosted injective nodes / exchange services  
- IBC relayer ops  
- Multi-language SDKs in-repo (TS is enough; Python/Go remain references)  
- Venture Group as a dependency for the hackathon demo  

## Completed follow-ups

1. Indexer verify — `chain/verify.ts` + spike / `demo:pitch`  
2. FeeGrant — [FEEGRANT.md](./FEEGRANT.md)  
3. Route B smoke — `npm run route-b:smoke` + [ROUTE-B.md](./ROUTE-B.md)  
4. MCP — `intentguard-policy` server (policy + audit, no keys)
