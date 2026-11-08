# OptionLens — deep brainstorm (no implementation yet)

**One-liner:** The analytics and hedging layer for Injective Options — fair value, implied probabilities, multi-leg risk, and a "hedge my GPU bill" desk, exposed to both humans and agents.

Maps to gap **#3** (options / SICI tooling, MCP for options) in [docs/LANDSCAPE.md](../docs/LANDSCAPE.md).

---

## 1. What Injective Options actually is (verified)

Source: [Introducing Onchain Options on Injective](https://injective.com/blog/injective-options) (Oct 27, 2026).

| Property | Detail |
|----------|--------|
| Instrument | **Capped** calls (strike + cap) and puts (strike + floor) — i.e. call/put **spreads** as single contracts |
| Style | European, cash-settled in native USDC |
| Collateral | Writer locks max payout upfront; no margin, no liquidations |
| Multiplier | Example: 0.01 × index per contract |
| Expiries | Several per market |
| Liquidity | One institutional LP quotes both sides of every strike |
| Writing | **Whitelist only** at launch |
| Settlement | Anyone can settle expired series on-chain |
| Markets | SICI, US500, US Tech, XAU, XAG, WTI |
| Status | **Testnet**; no public market IDs, contract addresses, or docs yet |

Worked example from the post: SICI 113, buy 100 calls strike 113 / cap 123 at $0.03 → cost $3, max payout $10, breakeven 116.

### Underlying data is live (checked)

All six underlyings exist as **mainnet perps** (read-only queries, no keys):

| Perp | Oracle | Mark (at check) |
|------|--------|-----------------|
| SICI/USDC | Provider (LO:TECH) | ~104.74 |
| US500/USDC | PythPro | ~736.6 |
| USTECH/USDC | PythPro | ~657.6 |
| XAU/USDC | PythPro | ~4071 |
| XAG/USDC | PythPro | ~51.96 |
| WTI/USDC | Provider | ~90.50 |

Testnet has **no SICI perp** (18 markets; GOLD is the only RWA-ish one). Mark scaling differs by market (e.g. SPX shows ~0.35) — normalise per market metadata.

---

## 2. Where the gap really is

The official app **already** shows premium, max profit, max loss, breakeven, and a payoff chart for a single trade. A single-trade payoff visualiser is **not** a differentiator.

What's missing:

| Gap | Why it matters |
|-----|----------------|
| **Is this premium fair?** | One LP quotes everything. No independent mark → users can't tell if they're paying 2x fair value. |
| **What does the market think?** | Capped spreads map neatly to implied probabilities — nobody presents them that way. |
| **Real-world hedging** | Injective's own pitch: "a firm renting GPUs could hedge compute costs against SICI." Nobody built the calculator that turns a GPU bill into a hedge. |
| **Portfolio view** | Perp + options + expiries combined; scenario grid across positions. |
| **Agents can't reason about options** | Trading MCP has zero options tools. |

---

## 3. Product surface

### A. Fair value & implied probability (core)

A capped call = long call(K) − short call(cap). Price with Black-76 on the perp mark:

\[
V_{\text{capped call}} = m \cdot \big[C(F, K, \sigma, T) - C(F, \text{cap}, \sigma, T)\big]
\]

- \(F\): mainnet perp mark (or oracle)
- \(\sigma\): realized vol from perp/oracle history (Chronos/indexer)
- \(m\): contract multiplier

Show per strike: **model value, LP quote, edge %, implied probability** (premium ÷ max payout ≈ risk-neutral odds of finishing in-the-money-ish), breakeven.

**SICI nuance (judges will like this):** SICI's published value is a **trailing 7-day average** of hourly GPU rental prices. That smoothing makes it low-vol and autocorrelated — lognormal Black-Scholes overprices short-dated tails. Offer a "smoothed index" vol adjustment and say why. Commodities/equity perps track 24/5 feeds → weekend gap handling.

### B. Compute Hedge Desk (the narrative feature)

Input: "We spend $50k/month on GPUs — 70% H100, 30% A100, for 3 months."

1. Map spend to SICI exposure (SICI weights: H100 40%, B200 25%, H200 15%, A100 10%, RTX 4090 10%) → flag **basis risk** (your mix ≠ index mix).
2. Recommend a capped-call ladder across expiries: notional, strikes, caps.
3. Output: "Hedge costs $1.1k (2.2% of spend); protects against SICI +5% → +15%; above +15% you're unhedged."
4. Mirror for GPU **providers** with capped puts.

### C. Portfolio & expiry

- Combine perp + options: e.g. long SICI perp + capped put = protected long; collars.
- Scenario grid (index at expiry × time) across all positions.
- Expiry calendar + "settle expired series" button (anyone can settle — keeper utility).

### D. OptionLens MCP (agent-native)

Tools: `options_fair_value`, `options_implied_probability`, `options_payoff`, `hedge_plan`, `options_portfolio_risk`.

Claude: *"What's the cheapest way to protect against compute costs rising 15% this quarter?"* → `hedge_plan` → structured answer with strikes and cost.

---

## 4. Data plan (the main risk)

| Data | Source | Status |
|------|--------|--------|
| Underlying price + history | Mainnet perp mark/oracle via indexer + Chronos (read-only) | Available |
| Option series (strikes, caps, expiries) | Options contract/module on testnet | **Unknown — needs whitelist / address** |
| LP quotes | Same | **Unknown** |
| Your positions | Same | Requires whitelist |

**Fallback if no access:** model series exactly as specified in the blog (strike/cap/multiplier/expiries), price them independently, and label the chain layer "simulated until whitelisted." The fair-value engine, hedge desk, and MCP still work; only "LP quote vs model" needs real data.

**Day-1 ask at Builder House:** Injective team → testnet whitelist + options contract address/ABI + series query path.

---

## 5. Demo script (≈3 minutes)

1. Pick **SICI** → live mainnet mark ~104.7, realized vol, smoothing note.
2. Strike ladder: model value vs LP quote, implied probability per strike, edge column (one strike visibly rich).
3. **Compute Hedge Desk:** "$50k/month, 70% H100, 3 months" → ladder recommendation, cost %, protected range, basis-risk warning.
4. Scenario slider: SICI +20% → hedge payout vs extra GPU cost.
5. Ask Claude via OptionLens MCP the hedging question → same plan, explained.

---

## 6. Competitive landscape

| Product | Gap |
|---------|-----|
| Official Injective Options app | Single-trade payoff only; no fair value, hedging, portfolio |
| Deribit / Lyra / Aevo analytics | Not Injective; vanilla options, not capped spreads on SICI/RWA indices |
| TradFi tools (OptionStrat, Greeks calculators) | No on-chain data, no SICI, no agent interface |

Positioning: **the independent price check + hedge desk for Injective's new options primitive** — and the first options toolset for agents.

---

## 7. Technical spikes

| # | Spike | Pass criterion |
|---|-------|----------------|
| 1 | Get options testnet whitelist + contract/ABI | Read one live series |
| 2 | SICI price history (mainnet Chronos/indexer) | ≥30 days hourly/daily series |
| 3 | Vol model sanity | Model prices blog example (113/123, ~$0.03) in the right ballpark |
| 4 | Market decimals | Correct human price for all six perps |
| 5 | MCP server skeleton | One tool callable from Cursor |

---

## 8. Risks

| Risk | Mitigation |
|------|------------|
| No whitelist / no series data | Simulated series + independent pricing; ask Injective day 1 |
| "Official app already has payoff charts" | Don't compete on single-trade UI; lead with fair value + hedge desk |
| Model credibility | Show assumptions; calibrate to blog example; SICI smoothing adjustment |
| Single LP, thin market | That's the pitch — users need an independent mark |
| Finance-heavy build | Keep to Black-76 + realized vol; no vol surface fitting |

---

## 9. Pitch (60 seconds)

1. Injective just launched capped options on SICI, the first AI compute index — with one LP quoting every strike.
2. Users see a payoff chart but can't tell if the price is fair, and businesses can't translate a GPU bill into a hedge.
3. OptionLens: independent fair value, implied probabilities, and a Compute Hedge Desk — plus the first options MCP for agents.
4. Live: $50k/month GPU spend → 3-month hedge for 2% of spend, explained by Claude.
5. Next: write-side analytics for whitelisted writers, settlement keeper, white-label for options protocols.

---

## 10. Open decisions

1. Can we get whitelist access? (decides real vs simulated chain layer)
2. Hedge desk first, or fair-value ladder first?
3. Web UI (charts) vs MCP-first?
4. How much quant depth: Black-76 only, or SICI smoothing model too?
