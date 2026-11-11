#!/usr/bin/env node
/**
 * Protocol E2E: offline LCD/tx-plan checks + optional live testnet grant scope (INTENTGUARD_E2E_LIVE=1).
 */
import assert from "node:assert/strict";
import { parseLcdAuthorization, marketIdsCoverPolicy } from "../authz/parseLcdAuthz.ts";
import { buildGrantTxPlan } from "../authz/buildGrantTx.ts";
import { planTradingGrant } from "../authz/planGrant.ts";
import { verifySessionGrantOnChain } from "../authz/verifySessionGrant.ts";
import { getSubaccountId } from "@injectivelabs/sdk-ts";
import { TRADING_SUBACCOUNT_INDEX } from "../chain/keys.ts";
import {
  E2E_PROTOCOL_EXIT_BLOCKED,
  formatBlockedGrantMessage,
  isMissingTestnetAuthzGrants,
} from "./e2eProtocolPrerequisites.ts";

const SPIKE_MARKET =
  "0xdc70164d7120529c3cd84278c98df4151210c0447a65a2aab03459cf328de41e";

function runOfflineChecks(): void {
  const lcd = parseLcdAuthorization({
    "@type": "/injective.exchange.v1beta1.CreateDerivativeLimitOrderAuthz",
    subaccount_id:
      "0x20d825cbc889a2f79797dbe374403148f9acd76d000000000000000000000001",
    market_ids: [SPIKE_MARKET],
  });
  assert.ok(lcd?.marketIds?.length);

  const plan = planTradingGrant({
    granteeAddress: "inj1grantee",
    subaccountId: "0xsub",
    policy: {
      version: 1,
      marketIds: [SPIKE_MARKET],
      maxMarginPerOrder: "10",
      maxLeverage: 2,
      dailyMarginBudget: "100",
    },
  });
  const tx = buildGrantTxPlan({
    granter: "inj1owner",
    grantee: "inj1grantee",
    plan,
  });
  assert.ok(tx.msgGrants.length >= 2);

  assert.equal(marketIdsCoverPolicy([SPIKE_MARKET], [SPIKE_MARKET]), true);
}

async function runLiveTestnetCheck(): Promise<void> {
  const GRANTER = "inj1yrvztj7g3x3009uhm03hgsp3fru6e4mdv7jpkz";
  const GRANTEE = "inj1cu9mv984p30etesxfrgwp3ve37mf5p8uhwrh9y";
  const sub = getSubaccountId(GRANTER, TRADING_SUBACCOUNT_INDEX);
  let live;
  try {
    live = await verifySessionGrantOnChain({
      network: "testnet",
      session: {
        ownerInjectiveAddress: GRANTER,
        granteeAddress: GRANTEE,
        revoked: false,
        subaccountId: sub,
        policy: {
          version: 1,
          marketIds: [SPIKE_MARKET],
          maxMarginPerOrder: "100",
          maxLeverage: 5,
          dailyMarginBudget: "500",
        },
      },
    });
  } catch (err) {
    console.error("FAIL e2e-protocol live: could not query testnet grants (not treating as missing-grant BLOCKED)");
    throw err;
  }

  if (isMissingTestnetAuthzGrants(live)) {
    console.error(formatBlockedGrantMessage(live));
    process.exit(E2E_PROTOCOL_EXIT_BLOCKED);
  }

  assert.equal(live.scopeMatch, true, live.issues.join("; "));

  if (!live.ready) {
    assert.ok(
      live.issues.some((i) => /expired/i.test(i)),
      `expected expired grant only; issues: ${live.issues.join("; ")}`,
    );
    console.log(
      "OK live scope (grant expired — re-grant for execute):",
      live.onChainLimitScopes[0],
    );
  } else {
    console.log("OK live testnet grant scope:", live.onChainLimitScopes[0]);
  }
}

runOfflineChecks();

const liveEnabled = process.env.INTENTGUARD_E2E_LIVE === "1";

if (liveEnabled) {
  await runLiveTestnetCheck();
  console.log("OK e2e-protocol: parse, tx plan, market scope + live testnet LCD");
} else {
  console.log(
    "OK e2e-protocol: parse, tx plan, market scope (live skipped — set INTENTGUARD_E2E_LIVE=1 after testnet typed grants are provisioned)",
  );
}
