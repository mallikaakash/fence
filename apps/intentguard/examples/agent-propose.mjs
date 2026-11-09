#!/usr/bin/env node
/**
 * Minimal agent integration — policy gate only (no keys in agent process).
 *
 *   INTENTGUARD_URL=http://127.0.0.1:8787 AGENT_TOKEN=agt_… node examples/agent-propose.mjs
 */
const base = (process.env.INTENTGUARD_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const token = process.env.AGENT_TOKEN;
if (!token?.startsWith("agt_")) {
  console.error("Set AGENT_TOKEN=agt_… from POST /v1/sessions");
  process.exit(1);
}

const intent = {
  marketId:
    process.env.MARKET_ID ??
    "0xdc70164d7120529c3cd84278c98df4151210c0447a65a2aab03459cf328de41e",
  margin: process.env.MARGIN ?? "2",
  leverage: Number(process.env.LEVERAGE ?? 2),
  price: process.env.PRICE ?? "1",
  quantity: process.env.QUANTITY ?? "2",
};

const res = await fetch(`${base}/v1/propose`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ intent }),
});

const body = await res.json();
console.log(res.status, JSON.stringify(body, null, 2));
if (body.phase === "policy_check") {
  console.log(
    body.status === "allowed"
      ? "→ Policy OK. No chain broadcast. Call POST /v1/execute on sidecar if execute enabled."
      : "→ Denied at policy gate.",
  );
}
process.exit(body.status === "allowed" ? 0 : 2);
