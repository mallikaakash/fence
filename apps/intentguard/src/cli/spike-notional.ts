#!/usr/bin/env node
/**
 * Prove checklist #4: notional enforcement before MsgExec broadcast.
 *
 *   npm run spike:notional
 *
 * Does NOT broadcast oversized orders. Optionally runs an allowed-size
 * MsgExec when --broadcast-ok is set (requires grant + quote balance).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { IsolatedGranteeSigner } from "../gateway/signer.ts";
import { proposeAndExecLimitOrder } from "../chain/liveExec.ts";
import {
  SPIKE_ALLOWED_MARKET_ID,
  createAuthZApi,
} from "../chain/network.ts";
import { broadcastTypedTradingGrants } from "../chain/typedGrant.ts";
import type { IntentGuardPolicy } from "../policy/types.ts";
import type { SpikeKeystore } from "../chain/keys.ts";

function loadStore(): SpikeKeystore {
  const path = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../.spike/keystore.json",
  );
  return JSON.parse(readFileSync(path, "utf8")) as SpikeKeystore;
}

async function main() {
  const store = loadStore();
  const broadcastOk = process.argv.includes("--broadcast-ok");

  const policy: IntentGuardPolicy = {
    version: 1,
    marketIds: [SPIKE_ALLOWED_MARKET_ID],
    maxMarginPerOrder: "100",
    maxOrderNotional: "50",
    maxLeverage: 5,
    dailyMarginBudget: "500",
  };

  const signer = new IsolatedGranteeSigner({
    granteeAddress: store.grantee.injectiveAddress,
    privateKeyHex: store.grantee.privateKeyHex,
  });

  const agent = { role: "agent" as const, apiToken: "agt_spike_notional" };

  console.log("\n=== Oversized notional (must deny at policy, no broadcast) ===");
  const oversized = await proposeAndExecLimitOrder({
    agent,
    policy,
    intent: {
      marketId: SPIKE_ALLOWED_MARKET_ID,
      margin: "20",
      leverage: 2,
      price: "100",
      quantity: "1", // notional 100 > 50
    },
    owner: store.owner,
    grantee: store.grantee,
    signer,
  });
  console.log(oversized);

  const notionalPass =
    oversized.status === "denied" &&
    oversized.stage === "policy" &&
    oversized.signed === false &&
    oversized.broadcast === false;

  console.log(notionalPass ? "PASS notional pre-broadcast deny" : "FAIL");

  const evidencePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../.spike/allowed-order.json",
  );
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(
    evidencePath,
    JSON.stringify({ at: new Date().toISOString(), deny: oversized }, null, 2) + "\n",
  );

  if (!broadcastOk) {
    console.log(
      "\nSkip allowed broadcast (pass --broadcast-ok after USDT/USDC funded + grant).",
    );
    console.log(`Wrote ${evidencePath}`);
    process.exit(notionalPass ? 0 : 1);
  }

  console.log("\n=== Ensure typed grant ===");
  const grant = await broadcastTypedTradingGrants({
    owner: store.owner,
    granteeAddress: store.grantee.injectiveAddress,
    marketIds: [SPIKE_ALLOWED_MARKET_ID],
    expirySeconds: 3600,
    includeCancel: true,
  });

  const grants = await createAuthZApi().fetchGrants({
    granter: store.owner.injectiveAddress,
    grantee: store.grantee.injectiveAddress,
  });
  console.log("grants", grants.grants?.length ?? 0);

  console.log("\n=== In-policy size MsgExec (needs quote deposits) ===");
  const ok = await proposeAndExecLimitOrder({
    agent,
    policy: { ...policy, maxOrderNotional: "500" },
    intent: {
      marketId: SPIKE_ALLOWED_MARKET_ID,
      margin: "5",
      leverage: 2,
      price: "20",
      quantity: "0.1", // notional 2
    },
    owner: store.owner,
    grantee: store.grantee,
    signer,
  });
  console.log(ok);

  writeFileSync(
    evidencePath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        deny: oversized,
        ok,
        grant: {
          txHash: grant.txHash,
          granter: store.owner.injectiveAddress,
          grantee: store.grantee.injectiveAddress,
          subaccountId: store.owner.subaccountId,
          marketIds: [SPIKE_ALLOWED_MARKET_ID],
          authorizationTypeUrls: [
            "/injective.exchange.v1beta1.CreateDerivativeLimitOrderAuthz",
            "/injective.exchange.v1beta1.CancelDerivativeOrderAuthz",
          ],
        },
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Wrote ${evidencePath}`);

  process.exit(notionalPass && ok.status === "allowed" ? 0 : notionalPass ? 2 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
