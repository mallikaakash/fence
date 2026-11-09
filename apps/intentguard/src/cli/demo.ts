#!/usr/bin/env node
/**
 * Offline Demo Day rehearsal (no chain keys required).
 *
 *   npm run demo
 */
import { scoreGrants } from "../authz/score.ts";
import { planTradingGrant } from "../authz/planGrant.ts";
import { IntentGuardGateway } from "../gateway/session.ts";
import type { IntentGuardPolicy } from "../policy/types.ts";

const BTC = "0xbtc-perp-demo";
const ETH = "0xeth-perp-demo";

const policy: IntentGuardPolicy = {
  version: 1,
  marketIds: [BTC, ETH],
  maxMarginPerOrder: "200",
  maxOrderNotional: "400",
  maxLeverage: 3,
  dailyMarginBudget: "500",
  expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
  reduceOnlyAlwaysAllowed: true,
};

const DEMO_SUBACCOUNT =
  "0xowner0000000000000000000000000000000000000000000000000000000001";

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

function main() {
  section("1. Grant Auditor (sample risky grants)");
  const audit = scoreGrants("inj1ownerdemo", [
    {
      grantee: "inj1oldbot",
      authorizationType: "/cosmos.authz.v1beta1.GenericAuthorization",
      msgTypeUrl: "/injective.exchange.v1beta1.MsgCreateDerivativeMarketOrder",
      expiration: undefined,
    },
    {
      grantee: "inj1evil",
      authorizationType: "/cosmos.authz.v1beta1.GenericAuthorization",
      msgTypeUrl: "/cosmos.bank.v1beta1.MsgSend",
    },
  ]);
  console.log(JSON.stringify(audit, null, 2));

  section("2. Create IntentGuard session (key stays in gateway)");
  const gateway = new IntentGuardGateway();
  const { view, agent } = gateway.createSession({ policy });
  console.log(view.policyEnglish);
  console.log({
    sessionId: view.sessionId,
    granteeAddress: view.granteeAddress,
    agentTokenPrefix: agent.apiToken.slice(0, 12) + "…",
    gatewayHoldsKey: gateway.debugHasGranteeKey(view.sessionId),
  });

  const plan = planTradingGrant({
    granteeAddress: view.granteeAddress,
    policy,
    subaccountId: DEMO_SUBACCOUNT,
  });
  console.log("\nTyped AuthZ grants:");
  for (const g of plan.typedGrants) {
    console.log(
      `- ${g.composerMsgType} markets=${g.marketIds.length} subaccount=…${g.subaccountId.slice(-4)}`,
    );
  }
  console.log("\nGrant plan warnings:");
  for (const w of plan.warnings) console.log(`- ${w}`);
  console.log("Gateway enforced:", plan.gatewayEnforced.join(", "));
  console.log("Claim:", plan.defensibleClaim);

  section("3. Allowed trade");
  const ok = gateway.propose(agent, {
    marketId: ETH,
    margin: "100",
    leverage: 2,
    price: "100",
    quantity: "2",
    side: "long",
  });
  console.log(ok);

  section("4. Prompt-injection style oversize (DENIED)");
  const bad = gateway.propose(agent, {
    marketId: ETH,
    margin: "2000",
    leverage: 10,
    price: "100",
    quantity: "50",
    side: "long",
  });
  console.log(bad);

  section("5. Wrong market (DENIED)");
  const wrongMkt = gateway.propose(agent, {
    marketId: "0xsici",
    margin: "50",
    leverage: 2,
    price: "10",
    quantity: "1",
  });
  console.log(wrongMkt);

  section("6. Revoke → further trade fails");
  gateway.revoke(view.sessionId);
  const after = gateway.propose(agent, {
    marketId: ETH,
    margin: "10",
    leverage: 1,
  });
  console.log(after);
  console.log("gatewayHoldsKey after revoke:", gateway.debugHasGranteeKey(view.sessionId));

  section("7. Audit trail");
  console.log(JSON.stringify(gateway.audit.list(), null, 2));

  section("Verdict");
  const passed =
    ok.status === "allowed" &&
    bad.status === "denied" &&
    wrongMkt.status === "denied" &&
    after.status === "denied" &&
    !gateway.debugHasGranteeKey(view.sessionId);
  console.log(
    passed
      ? "PASS — demo script holds (policy + key isolation + revoke)."
      : "FAIL — investigate before pitching.",
  );
  process.exit(passed ? 0 : 1);
}

main();
