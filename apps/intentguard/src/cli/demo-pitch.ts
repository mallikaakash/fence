#!/usr/bin/env node
/**
 * Demo Day pitch driver — cached on-chain proofs + live read-only chain checks.
 *
 *   npm run demo:pitch           # proofs + live auditor + indexer (no keys in output)
 *   npm run demo:pitch -- --offline-only
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchGranterGrants } from "../authz/fetchGrants.ts";
import { scoreGrants } from "../authz/score.ts";
import { formatGrantAuditReport } from "../authz/formatAudit.ts";
import { verifyPostExec } from "../chain/verify.ts";
import { TESTNET_USDC_DENOM } from "../chain/deposit.ts";
import { SPIKE_ALLOWED_MARKET_ID } from "../chain/network.ts";
import { evaluateTradeIntent } from "../policy/evaluate.ts";
import type { IntentGuardPolicy } from "../policy/types.ts";

const SPIKE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../.spike");
const EXPLORER = "https://testnet.explorer.injective.network/transaction";

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

function loadJson<T>(name: string): T | null {
  const path = join(SPIKE_DIR, name);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const PITCH = `
IntentGuard in 60 seconds
────────────────────────
1. Injective agents trade via AuthZ — but stock AutoSign only scopes message *types*.
2. Typed exchange AuthZ locks markets + subaccount; it still does not cap order *notional*.
3. IntentGuard: typed grants + isolated grantee signer + gateway policy — agent proposes, never signs MsgExec.
4. Live on testnet: wrong market dies at chain AuthZ; oversize dies in gateway before broadcast.
5. Kill switch: MsgRevoke — session dead on-chain.
`.trim();

type AllowedOrderProof = {
  deny: { status: string; reasons: string[]; broadcast: boolean };
  ok: {
    status: string;
    txHash?: string;
    reasons: string[];
    chain?: { subaccountId: string };
  };
  grant: {
    txHash: string;
    granter: string;
    grantee: string;
    subaccountId: string;
    marketIds: string[];
    authorizationTypeUrls: string[];
  };
};

function printProofs(proof: AllowedOrderProof | null) {
  if (!proof) {
    console.log(
      "No .spike/allowed-order.json — run: npm run spike:notional -- --broadcast-ok",
    );
    return;
  }

  console.log("Typed MsgGrant:");
  console.log(`  granter  ${proof.grant.granter}`);
  console.log(`  grantee  ${proof.grant.grantee}`);
  console.log(`  markets  ${proof.grant.marketIds.length} (INJ/USDC PERP)`);
  console.log(`  subaccount …${proof.grant.subaccountId.slice(-8)}`);
  console.log(`  types    ${proof.grant.authorizationTypeUrls.join(", ")}`);
  console.log(`  tx       ${EXPLORER}/${proof.grant.txHash}`);

  console.log("\nGateway notional DENY (no broadcast):");
  console.log(`  ${proof.deny.reasons.join("; ")}`);

  if (proof.ok.txHash) {
    console.log("\nIn-policy MsgExec (allowed):");
    console.log(`  reasons  ${proof.ok.reasons.join("; ")}`);
    console.log(`  tx       ${EXPLORER}/${proof.ok.txHash}`);
  }
}

function offlinePolicyBeat() {
  const policy: IntentGuardPolicy = {
    version: 1,
    marketIds: [SPIKE_ALLOWED_MARKET_ID],
    maxMarginPerOrder: "100",
    maxOrderNotional: "50",
    maxLeverage: 5,
    dailyMarginBudget: "500",
  };
  const deny = evaluateTradeIntent(policy, {
    marketId: SPIKE_ALLOWED_MARKET_ID,
    margin: "10",
    leverage: 2,
    price: "100",
    quantity: "2",
    side: "long",
  });
  const ok = evaluateTradeIntent(policy, {
    marketId: SPIKE_ALLOWED_MARKET_ID,
    margin: "5",
    leverage: 2,
    price: "1",
    quantity: "2",
    side: "long",
  });
  console.log(
    deny.allow ? "FAIL policy deny" : `Policy DENY: ${deny.reasons.join(", ")}`,
  );
  console.log(
    ok.allow ? `Policy ALLOW: ${ok.reasons.join(", ")}` : "FAIL policy allow",
  );
}

async function liveReadOnly(owner: string, subaccountId: string) {
  section("Live grant auditor (LCD)");
  const fetched = await fetchGranterGrants({ granter: owner, network: "testnet" });
  const report = scoreGrants(owner, fetched.grants);
  console.log(formatGrantAuditReport(report));

  section("Indexer snapshot (api.injective.exchange)");
  const snap = await verifyPostExec({
    subaccountId,
    marketId: SPIKE_ALLOWED_MARKET_ID,
    quoteDenom: TESTNET_USDC_DENOM,
  });
  console.log(
    JSON.stringify(
      {
        openOrders: snap.openOrders.length,
        orders: snap.openOrders.slice(0, 3),
        quoteBalance: snap.quoteBalance,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const offlineOnly = process.argv.includes("--offline-only");

  section("Pitch");
  console.log(PITCH);

  section("On-chain evidence (cached)");
  printProofs(loadJson<AllowedOrderProof>("allowed-order.json"));

  const spike = loadJson<{
    checklist: Record<string, { pass: boolean | null; detail: string }>;
    summary: { passed: number; failed: number };
  }>("spike-results.json");
  if (spike) {
    console.log("\nSpike checklist:");
    for (const [key, row] of Object.entries(spike.checklist)) {
      const icon = row.pass === true ? "✓" : row.pass === false ? "✗" : "○";
      console.log(`  ${icon} ${key}`);
    }
    console.log(
      `  (${spike.summary.passed} passed, ${spike.summary.failed} failed — see npm run spike)`,
    );
  }

  section("Offline policy engine (instant)");
  offlinePolicyBeat();

  if (offlineOnly) {
    console.log("\n( --offline-only: skipped LCD + indexer )");
    console.log("\nNext: npm run demo  |  npm run spike:notional");
    return;
  }

  const proof = loadJson<AllowedOrderProof>("allowed-order.json");
  const owner = proof?.grant.granter;
  const sub =
    proof?.grant.subaccountId ??
    proof?.ok.chain?.subaccountId;
  if (owner && sub) {
    await liveReadOnly(owner, sub);
  } else {
    console.log("\nSkip live checks — no owner/subaccount in allowed-order.json");
  }

  section("Commands for judges");
  console.log("  npm run demo              # offline session (no chain)");
  console.log("  npm run demo:pitch        # this script");
  console.log("  npm run audit -- inj1…      # any wallet grant risk");
  console.log("  npm run spike:notional    # notional gate proof");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
