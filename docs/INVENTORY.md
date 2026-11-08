# Injective services & releases — stock take

**As of:** 2026-11-08 (probed from this workspace).  
**Sources:** [injective.com/blog](https://injective.com/blog) post dates (51 flagship slugs scraped), [docs.injective.network](https://docs.injective.network), live HTTP probes, mainnet LCD, npm/GitHub where reachable.

**Legend — exists today**

| Status | Meaning |
|--------|---------|
| **Live (public)** | You can use it now without special access (may need wallet only). |
| **Live (mainnet, gated)** | On mainnet but whitelist, institution-only, or early-access sales. |
| **Testnet** | Announced live on testnet; mainnet TBD. |
| **Beta / private** | Product exists; access not open retail. |
| **Institutional / B2B** | Service for firms via Injective Labs; not a consumer URL. |
| **Announced / roadmap** | Blog or site copy; no verifiable public product yet. |
| **Ecosystem** | Third-party or partner integration on Injective. |

---

## 1. Executive summary

| Layer | What's real in 2026 |
|-------|---------------------|
| **Chain** | Cosmos + native **MultiVM EVM** (mainnet since Nov 2025), exchange module CLOB, permissions/RWA primitives, **v1.20.4** on mainnet (`injective-1`). |
| **Trading (retail)** | **[Helix](https://helixapp.com)** (+ **api.injective.exchange**), 350+ perps, **SICI perp**, spot, RFQ path for takers; **Injective Options** on **testnet (whitelist)**. |
| **Stablecoins & payments** | **Native USDC + CCTP** on mainnet; **x402** pay-per-request on mainnet; Bitrefill merchant rail. |
| **Tokenization** | **SEC-registered transfer agent** (Injective Institutional Services); **Mint** platform (institutional); **$1B+ Pineapple mortgage records** on-chain; pilots (POSCO/LG CNS, Musicow, fan tokens). **No public RWA marketplace.** |
| **Agents & AI** | **[agents.injective.com](https://agents.injective.com)** registry, **MCP** + **agent-skills**, **AuthZ autosign**, **injective-agent-sdk** / **@injectivelabs/ainj**; gaps in policy UX, options tooling, verification. |
| **Institutions** | **Institutional Rail** (early access), **INJC** Nasdaq ETF (Nov 2026), **Bitnomial INJ futures**, Policy Institute. |
| **Distribution** | **INJ on Solana** (Sunrise), LI.FI, Wormhole, Kraken USDC, Binance.US, etc. |

---

## 2. Recent releases timeline (2025–2026, flagship blog posts)

Sorted by **published date** from blog HTML (not sitemap `lastmod`, which is polluted by bulk re-saves).

### Q4 2026 (latest)

| Date | Release | Status (best judgment) |
|------|---------|------------------------|
| **2026-11-06** | **INJC** — Canary Staked INJ ETF on **Nasdaq** | **Live (public)** — tradfi ticker INJC |
| **2026-11-04** | **Institutional Rail** — enterprise validator mempool / next-block path | **Institutional / B2B** — `institutions@injectivelabs.org` |
| **2026-11-02** | **Hacker House** (first) | **Event** — builder program |
| **2026-10-27** | **Injective Options** — capped calls/puts, 6 underlyings | **Testnet**, whitelist writers |
| **2026-10-27** | **Stockdrop** — community buyback + tokenized stock rewards event | **Campaign** — check current phase |
| **2026-10-26** | **SICI** — Super Intelligence Compute Index | **Live (mainnet)** perp (USDC margin, up to 10×) |
| **2026-10-22–23** | INJC education (ETF basics, staking, chain→ETF guide) | **Docs / marketing** |
| **2026-10-20** | **BDACS / KRW1** — Korea won-backed stablecoin × RWA narrative | **Partnership** |
| **2026-10-18** | **INJ Burn 2.0** (tokenomics; blog slug refreshed) | **Live (protocol)** — burn auction mechanics |
| **2026-10-08** | **Gulf Labs** validator (Thailand institutional) | **Live** — validator |
| **2026-09-22** | **Bitrefill** — USDC pay at 8k+ merchants | **Live (public)** |
| **2026-09-17** | **INJ on Solana** (Sunrise, Raydium, StonkFun) | **Live (ecosystem)** |
| **2026-09-10** | **Injective USDC** as canonical across Cosmos & dYdX | **Live (narrative + integrations rolling)** |
| **2026-09-04** | **Pineapple** — $1B+ mortgage **records** tokenized on Injective | **Live (on-chain records)**, not retail securities mkt |
| **2026-09-03** | **SEC transfer agent** registration complete | **Live (institutional capability)** |
| **2026-09-02** | **Inside Injective Mint** | **Beta / private** issuance UI |
| **2026-09-08 area** | **iAgent 2.0** (blog refresh; module announced **2025-01-21**) | **Live (chain module)** — agent automation on Injective |

### H1–Q3 2026

| Date | Release | Status |
|------|---------|--------|
| **2026-08-19** | SEC registered **transfer agent** (milestone post) | **Live (institutional)** |
| **2026-08-07** | **Nova Program** recap (Microsoft, Web3Labs) | **Program** |
| **2026-08-04** | **LI.FI** on Injective | **Live (ecosystem)** |
| **2026-07-28** | **Kraken** native Injective USDC | **Live** |
| **2026-07-27** | **POSCO International + LG CNS** trade receivables pilot | **Pilot** |
| **2026-07-16** | **Injective Mint** announced; MiCA white paper | **Mint: beta/private**; MiCA: regulatory |
| **2026-07-14** | **Injective AI Agent SDK** (one package: docs, CLI, skills) | **Live (OSS/npm)** — `@injectivelabs/ainj` **0.1.0** |
| **2026-07-08** | New **injective.com** | **Live** |
| **2026-07-14** | Transfer agent **filing** with SEC | Superseded by registration posts |
| **2026-06-16** | **“Something Special”** fan-owned music royalty (Khalid) | **Live (tokenized IP example)** |
| **2026-06-08** | **x402** — AI agent USDC payments | **Live (mainnet)** — ~650ms settlement per blog |
| **2026-06-01** | **Injective MCP** (hosted docs + narrative) | **Live** — trading MCP is **local** ([GitHub](https://github.com/InjectiveLabs/mcp-server)) |
| **2026-05-25** | **Nova Program** launch | **Program** |
| **2026-05-21** | **Injective Policy Institute** (DC) | **Institutional / advocacy** |
| **2026-05-18** | Native **USDC migration** guide | **Live** |
| **2026-05-14** | **Binance.US** INJ; **Musicow** IP partnership | **Live / partnership** |
| **2026-05-13** | **11 resources** for AI on Injective | **Docs** |
| **2026-05-07** | **USDC + CCTP live** on mainnet | **Live (public)** |
| **2026-04-30** | **Injective Agents** platform post | **Live** — [agents.injective.com](https://agents.injective.com) **200** |
| **2026-04-15** | **INJ futures** on **Bitnomial** (CFTC DCM) | **Live (US regulated)** |
| **2026-02-25** | **Injective MCP Server** open source | **Live (OSS)** — also in `vendor/mcp-server/` |
| **2026-01-29** | **DigiShares × Valereum** tokenization suite | **Partnership** |
| **2026-01-20** | **INJ Supply Squeeze** (deflation) | **Live (tokenomics)** |
| **2026-01-15** | **Wormhole** bridge to Cosmos/Injective | **Live (ecosystem)** |
| **2025-11-11** | **Native EVM mainnet** (“Injective era”) | **Live (public)** |
| **2025-01-29** | **Injective EVM** unveiling (pre-mainnet) | Superseded by mainnet launch |
| **2025-01-21** | **iAgent 2.0** module | **Live (protocol)** |

Older blog bulk (Equinox 2020-era, Helix 2023, etc.) is **historical** — still relevant as **ongoing services** (Helix, Hub, staking), not “new releases.”

---

## 3. By category — what exists

### 3.1 Chain, consensus, MultiVM

| Service / primitive | Exists? | Notes |
|---------------------|---------|-------|
| Injective L1 (`injective-1`) | **Yes** | Mainnet app **v1.20.4-bl.2** (probed 2026-11-08) |
| Native **EVM** (chain id **1776**) | **Yes** | Embedded EVM, not legacy inEVM |
| **Precompiles** (Bank, Exchange, Oracle, Swap, Staking) | **Yes** | Solidity can trade via exchange precompile + `approve`/`spendLimit` |
| Exchange **CLOB** (spot, perps, expiry, binary options in docs) | **Yes** | New **vanilla capped options** are separate **2026 product** |
| **Permissions / TokenFactory / RWA** module (Volan+) | **Yes** | Compliance controls at issuance/transfer |
| **WasmX** / CosmWasm | **Yes** | Scheduled calls for automation |
| **iAgent 2.0** module | **Yes** | Agent-oriented chain features (2025 launch) |
| **Institutional Rail** | **Partial** | Announced Nov 2026; dedicated enterprise validator API — **early access only** |
| **24/5 equity feeds** (RWA perps) | **Yes** | US500, USTECH, metals, oil, SICI, etc. on mainnet perps |

### 3.2 Public trading & market data

| Service | Exists? | Probed |
|---------|---------|--------|
| **[Helix](https://helixapp.com)** | **Yes** | HTTP **200** |
| **[api.injective.exchange](https://api.injective.exchange)** | **Yes** | HTTP **200** |
| **[chain.injective.network](https://chain.injective.network)** | **Yes** | Status, testnet hub links |
| **Hub** (staking/gov) | **Yes** | Redirect **301** to current hub host |
| **Indexer / gRPC** (public endpoints) | **Yes** | Used by SDK; see chain portal |
| **SICI/USDC PERP** | **Yes** | Mainnet market + mark price (e.g. ~104.7) |
| **INJ RFQ** | **Yes** | [rfq.inj.so](https://rfq.inj.so/onboarding.html) **200**; gateway URL in skills; root gateway **404** (gRPC-web, not HTML) |
| **Injective Options** | **Testnet** | Whitelist; six markets; **no public contract addresses in docs yet** |
| **Retail RWA DEX** | **No** | Trade **listed** assets on Helix (e.g. USDY, AUSD historically); not a generic tokenized-stock supermarket |

### 3.3 Stablecoins, bridges, payments

| Service | Exists? | Notes |
|---------|---------|-------|
| **Native USDC** (Injective-issued) | **Yes** | Mainnet; migration from peggy USDT/USDCnb |
| **Circle CCTP V2** | **Yes** | In trading MCP: `cctp_*`, `usdc_native_info` |
| **Peggy** (ETH canonical) | **Yes** | Legacy bridge path |
| **deBridge DLN** | **Yes** | MCP bridge tools |
| **x402** agent payments | **Yes (mainnet)** | Pay-per-request APIs in USDC |
| **Bitrefill** | **Yes** | Spend USDC at merchants |
| **LI.FI** | **Yes** | Cross-chain into Injective MultiVM |

### 3.4 Tokenization, institutional rails, RWAs

| Service | Exists? | Public? |
|---------|---------|---------|
| **SEC-registered transfer agent** (Injective Institutional Services) | **Yes** | **B2B** — ownership records for tokenized securities |
| **Injective Mint** | **Yes** | **Beta / private** — no-code compliant issuance |
| **Pineapple mortgage records** | **Yes (on-chain)** | **Audit/metadata**, not tradable mortgage pool for retail |
| **POSCO + LG CNS** receivables pilot | **Pilot** | Korea trade finance |
| **Musicow**, **DigiShares/Valereum**, fan token drops | **Partnership / cases** | Varies by asset |
| **Stockdrop** | **Campaign** | Community + tokenized stock rewards framing |
| **BDACS KRW1** | **Partnership** | Won-backed stablecoin × RWA story |
| **Injective “Institutional Services”** umbrella | **Yes** | Transfer agent + Mint + Rail |

### 3.5 Agents, AI developer stack

| Service | Exists? | Notes |
|---------|---------|-------|
| **[agents.Injective.com](https://agents.injective.com)** | **Yes** | Registry, ERC-8004, fee recipient, strategies |
| **[MCP server](https://github.com/InjectiveLabs/mcp-server)** | **Yes** | Local stdio; perps, spot, bridge, EVM, AuthZ, RFQ metadata, CCTP |
| **[Docs MCP](https://docs.injective.network/mcp)** | **Yes** | Hosted; tools `search_injective_docs`, `query_docs_filesystem_injective_docs` |
| **[agent-skills](https://github.com/InjectiveLabs/agent-skills)** | **Yes** | 21 skills in upstream repo |
| **injective-agent-sdk** | **Yes** | Identity NFTs; packaging/docs still rough per your research |
| **@injectivelabs/ainj** | **Yes** | npm **0.1.0** |
| **@injectivelabs/sdk-ts** | **Yes** | **1.20.66** (Nov 2026) |
| **AuthZ autosign** | **Yes** | `authz_grant` / `authz_revoke` in MCP; trading msg types only |
| **Agent cross-margining** (spot+perp one account) | **Roadmap** | Marked “Coming Soon” on agents site |
| **Options MCP / agent analytics** | **No** | Gap for hackathon (OptionLens) |
| **Policy layer for agents** | **No product** | AuthZ only; gap (IntentGuard) |
| **NEAR-style general intents** | **No** | RFQ + AuthZ adjacent |

### 3.6 Regulated & tradfi distribution

| Service | Exists? |
|---------|---------|
| **INJC** ETF (Canary, Nasdaq) | **Yes** — Nov 5, 2026 |
| **INJ futures** (Bitnomial, CFTC) | **Yes** — Apr 2026 |
| **MiCA white paper** (INJ EU) | **Published** |
| **Policy Institute** (DC) | **Yes** |
| **Binance.US** spot INJ | **Yes** |
| **Kraken** native USDC | **Yes** |
| **Asia regulated access** (m-inj post) | **Narrative / compliance milestone** |

### 3.7 Programs, community, tokenomics

| Item | Exists? |
|------|---------|
| **Nova Program** (Microsoft, Azure AI) | **Yes** — cohorts / demo day |
| **Hacker House** | **Yes** — Oct 2026 kickoff |
| **Community BuyBack 2026** | **Yes** — ongoing mechanics |
| **INJ burn 2.0 / supply squeeze** | **Yes** — deflation |
| **Ambassadors, learn, dev portal** | **Yes** — [injective.com/dev](https://injective.com/dev) **200** |

### 3.8 Developer OSS (active, from GitHub push dates)

| Repo | Role |
|------|------|
| **injective-ts** | TS SDK monorepo |
| **sdk-go** / **sdk-python** | Clients |
| **mcp-server** | AI trading MCP |
| **agent-skills** | Agent playbooks |
| **injective-rfq-toolkit** | RFQ taker/builder tooling |
| **evm-gateway** | Standalone EVM JSON-RPC |
| **inj-examples** | Precompile demos |
| **injective-ui** | Shared UI packages |
| **injective-docs** | Doc source + hosted MCP |

---

## 4. Live probe snapshot (2026-11-08)

| URL | HTTP | Interpretation |
|-----|------|----------------|
| docs.injective.network/mcp | 405 | Expected (MCP POST-only) |
| helixapp.com | 200 | Retail DEX up |
| hub.injective.network | 301 | Hub up (redirect) |
| chain.injective.network | 200 | Portal up |
| api.injective.exchange | 200 | Exchange API up |
| rfq.gateway.grpc-web.injective.network/ | 404 | Not a browser page; use RFQ clients |
| rfq.inj.so/onboarding.html | 200 | RFQ docs/onboarding up |
| agents.injective.com | 200 | Agents platform up |
| injective.com/dev | 200 | Dev portal up |
| sentry.lcd.injective.network | 200 | Mainnet LCD up |

---

## 5. Explicitly **not** a full public product (common confusion)

| Thing | Reality |
|-------|---------|
| **Injective Mint** as “OpenSea for RWAs” | **No** — institutional issuance, private access |
| **Injective Options** on mainnet | **Not yet** — testnet + whitelist (Oct 2026) |
| **NEAR Intents–style solver network** | **No** on Injective |
| **Agent marketplace with verification** | Registry + x402 + partners; **no** canonical AgentProof layer |
| **Institutional Rail** for retail | **No** — enterprise sales |
| **Trading MCP on hosted URL** | **No** — run **local** `node dist/mcp/server.js` |
| **Options in MCP / skills** | **No** (yet) |

---

## 6. Hackathon relevance (your three ideas)

| Idea | Anchors to *existing* Injective surface |
|------|----------------------------------------|
| **IntentGuard** | Live **AuthZ** + exchange **precompile approve/spendLimit** + MCP `authz_*` |
| **OptionLens** | Live **SICI (+ RWA) perps** for marks; **options testnet** needs whitelist |
| **AgentProof** | Live **agents.injective.com**, **x402**, MCP simulation/market data |

---

## 7. How to refresh this doc

```bash
# Mainnet version
curl -s https://sentry.lcd.injective.network/cosmos/base/tendermint/v1beta1/node_info | jq -r '.application_version.version'

# Blog flagship slugs (manual list in /tmp/slugs.txt pattern)
# Docs search
# MCP: search_injective_docs in Cursor
```

Related: [LANDSCAPE.md](./LANDSCAPE.md), [ECOSYSTEM.md](./ECOSYSTEM.md).
