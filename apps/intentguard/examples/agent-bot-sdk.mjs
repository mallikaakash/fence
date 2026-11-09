#!/usr/bin/env node
/**
 * Same flow as agent-bot.mjs using the TypeScript gateway client (no build step).
 */
import { createGatewayClient, DEFAULT_INJ_PERP_MARKET_ID } from "../src/agent-sdk/index.ts";

const baseUrl = (process.env.INTENTGUARD_URL ?? "http://127.0.0.1:8787").replace(
  /\/$/,
  "",
);
const agentApiToken = process.env.AGENT_TOKEN;
if (!agentApiToken?.startsWith("agt_")) {
  console.error("Set AGENT_TOKEN=agt_…");
  process.exit(1);
}

const client = createGatewayClient({ baseUrl, agentApiToken });

const { json: session } = await client.agentSession();
console.log("session", JSON.stringify(session, null, 2));

const intent = {
  marketId: process.env.MARKET_ID ?? DEFAULT_INJ_PERP_MARKET_ID,
  margin: process.env.MARGIN ?? "2",
  leverage: Number(process.env.LEVERAGE ?? 2),
  price: process.env.PRICE ?? "10",
  quantity: process.env.QUANTITY ?? "1",
  side: process.env.SIDE ?? "long",
};

const { json: propose } = await client.propose(intent, {
  idempotencyKey: process.env.IDEMPOTENCY_KEY ?? `sdk-bot-${Date.now()}`,
});
console.log("propose", JSON.stringify(propose, null, 2));

if (propose.status !== "allowed") {
  process.exit(2);
}

if (process.env.EXECUTE !== "1") {
  console.log("→ Allowed. EXECUTE=1 for POST /v1/execute.");
  process.exit(0);
}

const { res: execRes, json: exec } = await client.execute(intent);
console.log("execute", execRes.status, JSON.stringify(exec, null, 2));
process.exit(execRes.ok && exec.broadcast ? 0 : 3);
