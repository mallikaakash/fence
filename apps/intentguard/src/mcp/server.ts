#!/usr/bin/env node
/**
 * IntentGuard MCP — policy + grant audit only (no keys, no MsgExec).
 *
 * Cursor: .cursor/mcp.json → intentguard-policy
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { evaluateTradeIntent } from "../policy/evaluate.ts";
import { explainPolicy } from "../policy/explain.ts";
import type { IntentGuardPolicy, TradeIntent } from "../policy/types.ts";
import { proposeTrade } from "../gateway/propose.ts";
import { fetchGranterGrants } from "../authz/fetchGrants.ts";
import { scoreGrants } from "../authz/score.ts";
import { formatGrantAuditReport } from "../authz/formatAudit.ts";
import { planTradingGrant } from "../authz/planGrant.ts";

const policySchema = z.object({
  version: z.number().default(1),
  marketIds: z.array(z.string()),
  maxMarginPerOrder: z.string(),
  maxOrderNotional: z.string(),
  maxLeverage: z.number(),
  dailyMarginBudget: z.string(),
  expiresAt: z.string().optional(),
  reduceOnlyAlwaysAllowed: z.boolean().optional(),
});

const intentSchema = z.object({
  marketId: z.string(),
  margin: z.string(),
  leverage: z.number(),
  price: z.string().optional(),
  quantity: z.string().optional(),
  side: z.enum(["long", "short"]).optional(),
  reduceOnly: z.boolean().optional(),
});

const server = new McpServer({
  name: "intentguard-policy",
  version: "0.1.8",
});

server.tool(
  "intentguard_propose",
  "Offline policy only (no sidecar). Does NOT broadcast — use intentguard_gateway_propose for live sessions.",
  {
    policy: policySchema,
    intent: intentSchema,
  },
  async ({ policy, intent }) => {
    const p = policy as IntentGuardPolicy;
    const i = intent as TradeIntent;
    const agent = { role: "agent" as const, apiToken: "mcp_agent" };
    const result = proposeTrade({ agent, policy: p, intent: i });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ...result,
              policyEnglish: explainPolicy(p),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  "intentguard_plan_grant",
  "Plan typed CreateDerivativeLimitOrderAuthz grants for a policy (offline JSON plan, not on-chain).",
  {
    granteeAddress: z.string(),
    subaccountId: z.string(),
    policy: policySchema,
  },
  async ({ granteeAddress, subaccountId, policy }) => {
    const plan = planTradingGrant({
      granteeAddress,
      subaccountId,
      policy: policy as IntentGuardPolicy,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(plan, null, 2) }],
    };
  },
);

async function gatewayFetch(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<unknown> {
  const base = process.env.INTENTGUARD_GATEWAY_URL?.replace(/\/$/, "");
  const token = process.env.INTENTGUARD_AGENT_TOKEN;
  if (!base || !token?.startsWith("agt_")) {
    throw new Error(
      "Set INTENTGUARD_GATEWAY_URL and INTENTGUARD_AGENT_TOKEN for gateway tools",
    );
  }
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

async function gatewayPropose(intent: TradeIntent): Promise<unknown> {
  return gatewayFetch("/v1/propose", {
    method: "POST",
    body: JSON.stringify({ intent }),
    idempotencyKey: process.env.INTENTGUARD_IDEMPOTENCY_KEY,
  });
}

server.tool(
  "intentguard_gateway_propose",
  "Live sidecar POST /v1/propose — phase=policy_check, broadcast=false. On allowed, owner must enable execute on sidecar for chain orders. Set INTENTGUARD_GATEWAY_URL + INTENTGUARD_AGENT_TOKEN.",
  { intent: intentSchema },
  async ({ intent }) => {
    const result = await gatewayPropose(intent as TradeIntent);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  "intentguard_gateway_health",
  "Query running sidecar GET /health (network, executeEnabled). Requires INTENTGUARD_GATEWAY_URL (+ agent token in env for consistency).",
  {},
  async () => {
    const base = process.env.INTENTGUARD_GATEWAY_URL?.replace(/\/$/, "");
    if (!base) {
      throw new Error("Set INTENTGUARD_GATEWAY_URL");
    }
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
  "intentguard_audit_grants",
  "Read-only AuthZ grant risk score for an inj1 granter (LCD).",
  {
    granter: z.string().describe("inj1… granter address"),
    mainnet: z.boolean().optional(),
  },
  async ({ granter, mainnet }) => {
    const fetched = await fetchGranterGrants({
      granter,
      network: mainnet ? "mainnet" : "testnet",
    });
    const report = scoreGrants(granter, fetched.grants);
    return {
      content: [
        {
          type: "text",
          text: [
            formatGrantAuditReport(report),
            "",
            `(endpoint: ${fetched.endpoint})`,
          ].join("\n"),
        },
      ],
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
