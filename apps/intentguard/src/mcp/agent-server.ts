#!/usr/bin/env node
/**
 * Reference agent MCP — live gateway only (agt_ + propose | execute | session).
 *
 * Cursor: .cursor/mcp.json → intentguard-agent
 * Env: INTENTGUARD_GATEWAY_URL, INTENTGUARD_AGENT_TOKEN (agt_…)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { TradeIntent } from "../policy/types.ts";

const intentSchema = z.object({
  marketId: z.string(),
  margin: z.string(),
  leverage: z.number(),
  price: z.string().optional(),
  quantity: z.string().optional(),
  side: z.enum(["long", "short"]).optional(),
  reduceOnly: z.boolean().optional(),
});

function gatewayEnv() {
  const base = process.env.INTENTGUARD_GATEWAY_URL?.replace(/\/$/, "");
  const token = process.env.INTENTGUARD_AGENT_TOKEN;
  if (!base || !token?.startsWith("agt_")) {
    throw new Error(
      "Set INTENTGUARD_GATEWAY_URL and INTENTGUARD_AGENT_TOKEN (agt_… from Protect or POST /v1/sessions)",
    );
  }
  return { base, token };
}

async function gatewayFetch(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
) {
  const { base, token } = gatewayEnv();
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  if (init.idempotencyKey) {
    headers["idempotency-key"] = init.idempotencyKey;
  }
  const res = await fetch(`${base}${path}`, { ...init, headers });
  return { httpStatus: res.status, ...(await res.json()) };
}

const server = new McpServer({
  name: "intentguard-agent",
  version: "0.1.0",
});

server.tool(
  "intentguard_agent_health",
  "GET /health — network and whether execute is enabled on the gateway.",
  {},
  async () => {
    const { base } = gatewayEnv();
    const res = await fetch(`${base}/health`);
    const json = await res.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ httpStatus: res.status, ...json }, null, 2),
        },
      ],
    };
  },
);

server.tool(
  "intentguard_agent_session",
  "GET /v1/agent/session — policy summary and daily margin remaining.",
  {},
  async () => {
    const result = await gatewayFetch("/v1/agent/session", { method: "GET" });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  "intentguard_agent_propose",
  "POST /v1/propose — policy gate only (phase=policy_check, no chain broadcast).",
  {
    intent: intentSchema,
    idempotencyKey: z.string().optional(),
  },
  async ({ intent, idempotencyKey }) => {
    const result = await gatewayFetch("/v1/propose", {
      method: "POST",
      body: JSON.stringify({ intent }),
      idempotencyKey,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  "intentguard_agent_execute",
  "POST /v1/execute — broadcast MsgExec after allow. Requires gateway execute + on-chain grant.",
  { intent: intentSchema },
  async ({ intent }) => {
    const result = await gatewayFetch("/v1/execute", {
      method: "POST",
      body: JSON.stringify({ intent: intent as TradeIntent }),
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
