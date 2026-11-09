import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { PrivateKey, getSubaccountId } from "@injectivelabs/sdk-ts";
import { IntentGuardGateway } from "../gateway/session.ts";
import type { IntentGuardPolicy, TradeIntent } from "../policy/types.ts";
import { planTradingGrant } from "../authz/planGrant.ts";
import { fetchGranterGrants } from "../authz/fetchGrants.ts";
import { scoreGrants } from "../authz/score.ts";
import { formatGrantAuditReport } from "../authz/formatAudit.ts";
import { TRADING_SUBACCOUNT_INDEX } from "../chain/keys.ts";
import { loadConfig } from "./config.ts";
import { FileStore } from "./store.ts";
import { executeAgentIntent } from "./execute.ts";
import { verifySessionGrantOnChain } from "../authz/verifySessionGrant.ts";

type Json = Record<string, unknown>;

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  return JSON.parse(text) as unknown;
}

function send(res: ServerResponse, status: number, body: Json) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

function bearer(req: IncomingMessage): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim();
}

export function startGatewayServer() {
  const config = loadConfig();
  const store = new FileStore(config.dataDir);
  const gateway = new IntentGuardGateway();

  function persist() {
    store.save({
      version: 1,
      updatedAt: new Date().toISOString(),
      sessions: gateway.exportSessions(),
      audit: gateway.audit.list(),
    });
  }

  function hydrate() {
    const state = store.load();
    for (const s of state.sessions) gateway.importSession(s);
    gateway.audit.replaceAll(state.audit);
  }

  hydrate();

  const server = createServer(async (req, res) => {
    if (!req.url || !req.method) return send(res, 400, { error: "bad request" });

    if (req.method === "OPTIONS") return send(res, 204, {});

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;

    try {
      if (req.method === "GET" && path === "/health") {
        return send(res, 200, {
          ok: true,
          service: "intentguard-gateway",
          version: "0.1.2",
          executeEnabled: config.executeEnabled,
          network: config.network,
          requireOnChainGrant: config.requireOnChainGrant,
          sessions: gateway.exportSessions().length,
        });
      }

      if (req.method === "GET" && path === "/v1/openapi.json") {
        return send(res, 200, {
          openapi: "3.0.0",
          info: { title: "IntentGuard Gateway", version: "0.1.0" },
          paths: {
            "/health": { get: { summary: "Liveness" } },
            "/v1/sessions": { post: { summary: "Create session (owner)" } },
            "/v1/sessions/{id}": { get: { summary: "Get session (owner)" } },
            "/v1/sessions/{id}/grant-status": {
              get: { summary: "On-chain typed grant check (owner)" },
            },
            "/v1/sessions/{id}/revoke": { post: { summary: "Revoke (owner)" } },
            "/v1/propose": { post: { summary: "Propose trade (agent)" } },
            "/v1/execute": {
              post: {
                summary: "Propose + MsgExec when INTENTGUARD_EXECUTE=1 (agent)",
              },
            },
            "/v1/grants/plan": { post: { summary: "Typed grant plan" } },
            "/v1/audit/grants": { get: { summary: "Grant auditor (public)" } },
            "/v1/audit/events": { get: { summary: "Audit log (owner)" } },
          },
        });
      }

      const owner = bearer(req);
      const isOwner = owner === config.ownerApiKey;

      if (req.method === "POST" && path === "/v1/sessions") {
        if (!isOwner) return send(res, 401, { error: "owner authorization required" });

        const body = (await readBody(req)) as {
          policy?: IntentGuardPolicy;
          ownerInjectiveAddress?: string;
          subaccountIndex?: number;
        };
        if (!body.policy?.marketIds?.length) {
          return send(res, 400, { error: "policy.marketIds required" });
        }

        const granteePk = PrivateKey.generate().privateKey as PrivateKey;
        const granteeAddress = granteePk.toBech32();
        const ownerAddr = body.ownerInjectiveAddress ?? "inj1owner_set_via_grant";
        const subIndex = body.subaccountIndex ?? TRADING_SUBACCOUNT_INDEX;
        let subaccountId = `0xSUBACCOUNT_TBD_INDEX_${subIndex}`;
        if (body.ownerInjectiveAddress) {
          try {
            subaccountId = getSubaccountId(body.ownerInjectiveAddress, subIndex);
          } catch {
            return send(res, 400, {
              error: "ownerInjectiveAddress must be a valid inj1… bech32 address",
            });
          }
        }

        const { view, agent } = gateway.createSession({
          policy: body.policy,
          granteeAddress,
          granteePrivateKeyHex: granteePk.toPrivateKeyHex().replace(/^0x/, ""),
          ownerInjectiveAddress: body.ownerInjectiveAddress,
          subaccountId,
          subaccountIndex: subIndex,
        });

        const plan = planTradingGrant({
          granteeAddress,
          subaccountId,
          policy: body.policy,
        });

        persist();

        return send(res, 201, {
          session: view,
          agentApiToken: agent.apiToken,
          agentTokenNote:
            "Deliver agentApiToken to the agent runtime only — never commit it.",
          ownerInjectiveAddress: ownerAddr,
          subaccountId,
          grantPlan: plan,
        });
      }

      if (req.method === "GET" && path === "/v1/sessions") {
        if (!isOwner) return send(res, 401, { error: "owner authorization required" });
        return send(res, 200, { sessions: gateway.listPublicSessions() });
      }

      const sessionMatch = path.match(/^\/v1\/sessions\/([^/]+)$/);
      if (req.method === "GET" && sessionMatch) {
        if (!isOwner) return send(res, 401, { error: "owner authorization required" });
        const id = sessionMatch[1]!;
        const view = gateway.getPublicSession(id);
        if (!view) return send(res, 404, { error: "session not found" });
        return send(res, 200, { session: view });
      }

      const grantStatusMatch = path.match(/^\/v1\/sessions\/([^/]+)\/grant-status$/);
      if (req.method === "GET" && grantStatusMatch) {
        if (!isOwner) return send(res, 401, { error: "owner authorization required" });
        const id = grantStatusMatch[1]!;
        const session = gateway.getSessionRecord(id);
        if (!session) return send(res, 404, { error: "session not found" });
        const mainnet = url.searchParams.get("mainnet") === "1";
        const status = await verifySessionGrantOnChain({
          session,
          network: mainnet ? "mainnet" : config.network,
        });
        return send(res, 200, { sessionId: id, grantStatus: status });
      }

      const revokeMatch = path.match(/^\/v1\/sessions\/([^/]+)\/revoke$/);
      if (req.method === "POST" && revokeMatch) {
        if (!isOwner) return send(res, 401, { error: "owner authorization required" });
        const id = revokeMatch[1]!;
        const view = gateway.revoke(id);
        persist();
        return send(res, 200, { session: view, revoked: true });
      }

      if (req.method === "POST" && path === "/v1/propose") {
        const token = bearer(req);
        if (!token?.startsWith("agt_")) {
          return send(res, 401, { error: "agent Bearer agt_… required" });
        }
        const body = (await readBody(req)) as { intent?: TradeIntent };
        if (!body.intent?.marketId) {
          return send(res, 400, { error: "intent.marketId required" });
        }
        const result = gateway.propose(
          { role: "agent", apiToken: token },
          body.intent,
        );
        persist();
        return send(res, 200, result);
      }

      if (req.method === "POST" && path === "/v1/execute") {
        const token = bearer(req);
        if (!token?.startsWith("agt_")) {
          return send(res, 401, { error: "agent Bearer agt_… required" });
        }
        if (!config.executeEnabled) {
          return send(res, 503, {
            error:
              "execute disabled — set INTENTGUARD_EXECUTE=1 and owner key on sidecar",
          });
        }
        if (!config.ownerPrivateKeyHex) {
          return send(res, 503, {
            error:
              "owner signing key missing — INTENTGUARD_OWNER_PRIVATE_KEY_HEX or .intentguard/owner-private-key.hex",
          });
        }
        const body = (await readBody(req)) as { intent?: TradeIntent };
        if (!body.intent?.marketId) {
          return send(res, 400, { error: "intent.marketId required" });
        }
        const result = await executeAgentIntent({
          gateway,
          agentApiToken: token,
          intent: body.intent,
          ownerPrivateKeyHex: config.ownerPrivateKeyHex,
          requireOnChainGrant: config.requireOnChainGrant,
          network: config.network,
        });
        persist();
        return send(res, 200, result);
      }

      if (req.method === "POST" && path === "/v1/grants/plan") {
        if (!isOwner) return send(res, 401, { error: "owner authorization required" });
        const body = (await readBody(req)) as {
          policy?: IntentGuardPolicy;
          granteeAddress?: string;
          subaccountId?: string;
        };
        if (!body.policy || !body.granteeAddress || !body.subaccountId) {
          return send(res, 400, {
            error: "policy, granteeAddress, subaccountId required",
          });
        }
        const plan = planTradingGrant({
          policy: body.policy,
          granteeAddress: body.granteeAddress,
          subaccountId: body.subaccountId,
        });
        return send(res, 200, { plan });
      }

      if (req.method === "GET" && path === "/v1/audit/grants") {
        const granter = url.searchParams.get("granter");
        if (!granter?.startsWith("inj1")) {
          return send(res, 400, { error: "granter=inj1… query required" });
        }
        const mainnet = url.searchParams.get("mainnet") === "1";
        const fetched = await fetchGranterGrants({
          granter,
          network: mainnet ? "mainnet" : "testnet",
        });
        const report = scoreGrants(granter, fetched.grants);
        return send(res, 200, {
          pretty: formatGrantAuditReport(report),
          report,
          endpoint: fetched.endpoint,
        });
      }

      if (req.method === "GET" && path === "/v1/audit/events") {
        if (!isOwner) return send(res, 401, { error: "owner authorization required" });
        const sessionId = url.searchParams.get("sessionId");
        let events = gateway.audit.list();
        if (sessionId) {
          events = events.filter(
            (e) => (e.detail as { sessionId?: string })?.sessionId === sessionId,
          );
        }
        return send(res, 200, { events });
      }

      return send(res, 404, { error: "not found" });
    } catch (err) {
      return send(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  server.listen(config.port, config.bindHost, () => {
    console.log(
      `IntentGuard gateway listening on http://${config.bindHost}:${config.port}`,
    );
    console.log(`Data: ${config.dataDir}`);
    console.log(`OpenAPI: http://127.0.0.1:${config.port}/v1/openapi.json`);
  });

  return { server, config, gateway, persist };
}
