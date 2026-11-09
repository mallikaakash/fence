#!/usr/bin/env node
/**
 * Reference trading bot loop — agt_ token only, propose then optional execute.
 *
 *   INTENTGUARD_URL=https://…/api/gateway AGENT_TOKEN=agt_… node examples/agent-bot.mjs
 *   EXECUTE=1 …  # call POST /v1/execute when propose allows (live testnet only)
 */
const base = (process.env.INTENTGUARD_URL ?? "http://127.0.0.1:8787").replace(
  /\/$/,
  "",
);
const token = process.env.AGENT_TOKEN;
if (!token?.startsWith("agt_")) {
  console.error("Set AGENT_TOKEN=agt_… (Protect → Connect your agent)");
  process.exit(1);
}

const headers = {
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
};

const intent = {
  marketId:
    process.env.MARKET_ID ??
    "0xdc70164d7120529c3cd84278c98df4151210c0447a65a2aab03459cf328de41e",
  margin: process.env.MARGIN ?? "2",
  leverage: Number(process.env.LEVERAGE ?? 2),
  price: process.env.PRICE ?? "10",
  quantity: process.env.QUANTITY ?? "1",
  side: process.env.SIDE ?? "long",
};

const sessionRes = await fetch(`${base}/v1/agent/session`, { headers });
const session = await sessionRes.json();
console.log("session", sessionRes.status, JSON.stringify(session, null, 2));

const idem = process.env.IDEMPOTENCY_KEY ?? `bot-${Date.now()}`;
const proposeRes = await fetch(`${base}/v1/propose`, {
  method: "POST",
  headers: { ...headers, "idempotency-key": idem },
  body: JSON.stringify({ intent }),
});
const propose = await proposeRes.json();
console.log("propose", proposeRes.status, JSON.stringify(propose, null, 2));

if (propose.status !== "allowed") {
  process.exit(2);
}

if (process.env.EXECUTE !== "1") {
  console.log("→ Propose allowed. Set EXECUTE=1 to call POST /v1/execute.");
  process.exit(0);
}

const execRes = await fetch(`${base}/v1/execute`, {
  method: "POST",
  headers,
  body: JSON.stringify({ intent }),
});
const exec = await execRes.json();
console.log("execute", execRes.status, JSON.stringify(exec, null, 2));
process.exit(execRes.ok && exec.broadcast ? 0 : 3);
