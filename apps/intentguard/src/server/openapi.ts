import { INTENTGUARD_VERSION } from "./version.ts";

/** OpenAPI 3.0 for codegen / agent tools — served at GET /v1/openapi.json */
export function buildOpenApiDocument() {
  return {
    openapi: "3.0.3",
    info: {
      title: "IntentGuard Gateway",
      version: INTENTGUARD_VERSION,
      description:
        "Agent uses agt_… on POST /v1/propose (policy only) and POST /v1/execute (MsgExec when enabled). See docs/AGENTS.md.",
    },
    servers: [{ url: "http://127.0.0.1:8787" }],
    components: {
      securitySchemes: {
        ownerBearer: { type: "http", scheme: "bearer", description: "own_…" },
        agentBearer: { type: "http", scheme: "bearer", description: "agt_…" },
      },
      schemas: {
        TradeIntent: {
          type: "object",
          required: ["marketId", "margin", "leverage"],
          properties: {
            marketId: { type: "string" },
            margin: { type: "string" },
            leverage: { type: "number" },
            price: { type: "string" },
            quantity: { type: "string" },
            side: { enum: ["long", "short"] },
            reduceOnly: { type: "boolean" },
          },
        },
        ProposeRequest: {
          type: "object",
          required: ["intent"],
          properties: {
            intent: { $ref: "#/components/schemas/TradeIntent" },
          },
        },
        ProposeResponse: {
          type: "object",
          required: [
            "status",
            "phase",
            "chainEffect",
            "signed",
            "broadcast",
            "wouldSign",
            "dryRun",
            "decisionReasons",
          ],
          properties: {
            status: { enum: ["allowed", "denied"] },
            phase: { enum: ["policy_check"] },
            chainEffect: { enum: ["none"] },
            signed: { type: "boolean", enum: [false] },
            broadcast: { type: "boolean", enum: [false] },
            wouldSign: { type: "boolean" },
            dryRun: { type: "boolean", enum: [true] },
            decisionReasons: { type: "array", items: { type: "string" } },
            sessionId: { type: "string" },
            granteeAddress: { type: "string" },
            note: { type: "string" },
            idempotentReplay: { type: "boolean" },
          },
        },
        ExecuteResponse: {
          type: "object",
          properties: {
            status: { type: "string" },
            phase: { enum: ["chain_broadcast"] },
            stage: { type: "string" },
            signed: { type: "boolean" },
            broadcast: { type: "boolean" },
            reasons: { type: "array", items: { type: "string" } },
            sessionId: { type: "string" },
            txHash: { type: "string" },
          },
        },
        HealthResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            version: { type: "string" },
            network: { enum: ["testnet", "mainnet"] },
            executeEnabled: { type: "boolean" },
          },
        },
      },
    },
    paths: {
      "/health": {
        get: {
          summary: "Service health",
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthResponse" },
                },
              },
            },
          },
        },
      },
      "/health/live": { get: { summary: "Liveness" } },
      "/health/ready": { get: { summary: "Readiness" } },
      "/v1/propose": {
        post: {
          summary: "Policy check (no chain broadcast)",
          security: [{ agentBearer: [] }],
          parameters: [
            {
              name: "Idempotency-Key",
              in: "header",
              schema: { type: "string" },
              description: "Replay same response within 1h for same session",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProposeRequest" },
              },
            },
          },
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ProposeResponse" },
                },
              },
            },
          },
        },
      },
      "/v1/execute": {
        post: {
          summary: "Policy + MsgExec when INTENTGUARD_EXECUTE=1",
          security: [{ agentBearer: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProposeRequest" },
              },
            },
          },
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ExecuteResponse" },
                },
              },
            },
          },
        },
      },
      "/v1/sessions": {
        post: { summary: "Create session (owner)", security: [{ ownerBearer: [] }] },
        get: { summary: "List sessions (owner)", security: [{ ownerBearer: [] }] },
      },
      "/v1/audit/events": {
        get: { summary: "Audit log (owner)", security: [{ ownerBearer: [] }] },
      },
    },
  };
}
