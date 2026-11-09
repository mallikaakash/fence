import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { PrivateKey, getSubaccountId } from "@injectivelabs/sdk-ts";
import { IntentGuardGateway } from "../gateway/session.ts";
import type { IntentGuardPolicy, TradeIntent } from "../policy/types.ts";
import { planTradingGrant } from "../authz/planGrant.ts";
import { fetchGranterGrants } from "../authz/fetchGrants.ts";
import { scoreGrants } from "../authz/score.ts";
import { formatGrantAuditReport } from "../authz/formatAudit.ts";
import { TRADING_SUBACCOUNT_INDEX } from "../chain/keys.ts";
import { loadConfig, rotateOwnerApiKey, type GatewayConfig } from "./config.ts";
import { SecureFileStore } from "./secureStore.ts";
import { executeAgentIntent } from "./execute.ts";
import { verifySessionGrantOnChain } from "../authz/verifySessionGrant.ts";
import { buildGrantTxPlan } from "../authz/buildGrantTx.ts";
import { safeEqual } from "./auth.ts";
import { RateLimiter } from "./rateLimit.ts";

type Json = Record<string, unknown>;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    const buf = c as Buffer;
    total += buf.length;
    if (total > maxBytes) {
      throw new HttpError(413, "request body too large");
    }
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
}

function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  config: GatewayConfig,
  status: number,
  body: Json,
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
  const origin = req.headers.origin;
  if (origin && config.corsOrigins.includes(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["vary"] = "Origin";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function bearer(req: IncomingMessage): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim();
}

export function startGatewayServer() {
  const config = loadConfig();
  let ownerApiKey = config.ownerApiKey;
  const store = new SecureFileStore(config.dataDir, config.dataKey);
  const gateway = new IntentGuardGateway();
  const limiter = new RateLimiter({
    windowMs: 60_000,
    maxRequests: config.rateLimitPerMinute,
  });

  const send = (
    req: IncomingMessage,
    res: ServerResponse,
    status: number,
    body: Json,
  ) => sendJson(req, res, config, status, body);

  function persist() {
    store.save(gateway.exportSessions(), gateway.audit.list());
  }

  function hydrate() {
    const state = store.load();
    for (const s of state.sessions) gateway.importSession(s);
    gateway.audit.replaceAll(state.audit);
  }

  hydrate();

  const server = createServer(async (req, res) => {
    if (!req.url || !req.method) return send(req, res, 400, { error: "bad request" });

    if (req.method === "OPTIONS") return send(req, res, 204, {});

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;
    const clientIp = req.socket.remoteAddress ?? "unknown";
    const rateKey = `${clientIp}:${path.split("/").slice(0, 3).join("/")}`;
    const retry = limiter.check(rateKey);
    if (retry !== null) {
      return send(req, res, 429, {
        error: "rate limit exceeded",
        retryAfterSeconds: retry,
      });
    }

    try {
      if (req.method === "GET" && path === "/health") {
        return send(req, res, 200, {
          ok: true,
          service: "intentguard-gateway",
          version: "0.1.4",
          executeEnabled: config.executeEnabled,
          network: config.network,
          requireOnChainGrant: config.requireOnChainGrant,
          encryptionAtRest: Boolean(config.dataKey),
          sessions: gateway.exportSessions().length,
        });
      }

      if (req.method === "GET" && path === "/v1/openapi.json") {
        return send(req, res, 200, {
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
            "/v1/owner/rotate-api-key": {
              post: { summary: "Rotate owner HTTP API key" },
            },
          },
        });
      }

      const owner = bearer(req);
      const isOwner = Boolean(owner && safeEqual(owner, ownerApiKey));

      if (req.method === "POST" && path === "/v1/owner/rotate-api-key") {
        if (!isOwner) {
          return send(req, res, 401, { error: "owner authorization required" });
        }
        ownerApiKey = rotateOwnerApiKey(config.configPath);
        gateway.audit.append("owner_key_rotated", "Owner HTTP API key rotated", {});
        persist();
        return send(req, res, 200, {
          ownerApiKey,
          note: "Update automations and console with the new key",
        });
      }

      if (req.method === "POST" && path === "/v1/sessions") {
        if (!isOwner) return send(req, res, 401, { error: "owner authorization required" });

        const body = (await readBody(req, config.maxBodyBytes)) as {
          policy?: IntentGuardPolicy;
          ownerInjectiveAddress?: string;
          subaccountIndex?: number;
        };
        if (!body.policy?.marketIds?.length) {
          return send(req, res, 400, { error: "policy.marketIds required" });
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
            return send(req, res, 400, {
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

        return send(req, res, 201, {
          session: view,
          agentApiToken: agent.apiToken,
          agentTokenExpiresAt:
            gateway.getSessionRecord(view.sessionId)?.agentTokenExpiresAt,
          agentTokenNote:
            "Deliver agentApiToken to the agent runtime only — never commit it.",
          ownerInjectiveAddress: ownerAddr,
          subaccountId,
          grantPlan: plan,
        });
      }

      if (req.method === "GET" && path === "/v1/sessions") {
        if (!isOwner) return send(req, res, 401, { error: "owner authorization required" });
        return send(req, res, 200, { sessions: gateway.listPublicSessions() });
      }

      const sessionMatch = path.match(/^\/v1\/sessions\/([^/]+)$/);
      if (req.method === "GET" && sessionMatch) {
        if (!isOwner) return send(req, res, 401, { error: "owner authorization required" });
        const id = sessionMatch[1]!;
        const view = gateway.getPublicSession(id);
        if (!view) return send(req, res, 404, { error: "session not found" });
        return send(req, res, 200, { session: view });
      }

      const grantStatusMatch = path.match(/^\/v1\/sessions\/([^/]+)\/grant-status$/);
      if (req.method === "GET" && grantStatusMatch) {
        if (!isOwner) return send(req, res, 401, { error: "owner authorization required" });
        const id = grantStatusMatch[1]!;
        const session = gateway.getSessionRecord(id);
        if (!session) return send(req, res, 404, { error: "session not found" });
        const mainnet = url.searchParams.get("mainnet") === "1";
        const status = await verifySessionGrantOnChain({
          session,
          network: mainnet ? "mainnet" : config.network,
        });
        return send(req, res, 200, { sessionId: id, grantStatus: status });
      }

      const grantTxMatch = path.match(/^\/v1\/sessions\/([^/]+)\/grant-tx-plan$/);
      if (req.method === "GET" && grantTxMatch) {
        if (!isOwner) return send(req, res, 401, { error: "owner authorization required" });
        const id = grantTxMatch[1]!;
        const session = gateway.getSessionRecord(id);
        if (!session) return send(req, res, 404, { error: "session not found" });
        if (!session.ownerInjectiveAddress || !session.subaccountId) {
          return send(req, res, 400, {
            error: "session missing ownerInjectiveAddress or subaccountId",
          });
        }
        const plan = planTradingGrant({
          granteeAddress: session.granteeAddress,
          subaccountId: session.subaccountId,
          policy: session.policy,
        });
        const txPlan = buildGrantTxPlan({
          granter: session.ownerInjectiveAddress,
          grantee: session.granteeAddress,
          plan,
        });
        return send(req, res, 200, {
          sessionId: id,
          grantPlan: plan,
          txPlan,
          scopeNote:
            "v0: derivative limit + cancel only — gateway enforces notional/leverage",
        });
      }

      const revokeMatch = path.match(/^\/v1\/sessions\/([^/]+)\/revoke$/);
      if (req.method === "POST" && revokeMatch) {
        if (!isOwner) return send(req, res, 401, { error: "owner authorization required" });
        const id = revokeMatch[1]!;
        const view = gateway.revoke(id);
        persist();
        return send(req, res, 200, { session: view, revoked: true });
      }

      if (req.method === "POST" && path === "/v1/propose") {
        const token = bearer(req);
        if (!token?.startsWith("agt_")) {
          return send(req, res, 401, { error: "agent Bearer agt_… required" });
        }
        const body = (await readBody(req, config.maxBodyBytes)) as {
          intent?: TradeIntent;
        };
        if (!body.intent?.marketId) {
          return send(req, res, 400, { error: "intent.marketId required" });
        }
        const result = gateway.propose(
          { role: "agent", apiToken: token },
          body.intent,
        );
        persist();
        return send(req, res, 200, result);
      }

      if (req.method === "POST" && path === "/v1/execute") {
        const token = bearer(req);
        if (!token?.startsWith("agt_")) {
          return send(req, res, 401, { error: "agent Bearer agt_… required" });
        }
        if (!config.executeEnabled) {
          return send(req, res, 503, {
            error:
              "execute disabled — set INTENTGUARD_EXECUTE=1 and owner key on sidecar",
          });
        }
        if (!config.ownerPrivateKeyHex) {
          return send(req, res, 503, {
            error:
              "owner signing key missing — INTENTGUARD_OWNER_PRIVATE_KEY_HEX or .intentguard/owner-private-key.hex",
          });
        }
        const body = (await readBody(req, config.maxBodyBytes)) as {
          intent?: TradeIntent;
        };
        if (!body.intent?.marketId) {
          return send(req, res, 400, { error: "intent.marketId required" });
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
        return send(req, res, 200, result);
      }

      if (req.method === "POST" && path === "/v1/grants/plan") {
        if (!isOwner) return send(req, res, 401, { error: "owner authorization required" });
        const body = (await readBody(req, config.maxBodyBytes)) as {
          policy?: IntentGuardPolicy;
          granteeAddress?: string;
          subaccountId?: string;
        };
        if (!body.policy || !body.granteeAddress || !body.subaccountId) {
          return send(req, res, 400, {
            error: "policy, granteeAddress, subaccountId required",
          });
        }
        const plan = planTradingGrant({
          policy: body.policy,
          granteeAddress: body.granteeAddress,
          subaccountId: body.subaccountId,
        });
        return send(req, res, 200, { plan });
      }

      if (req.method === "GET" && path === "/v1/audit/grants") {
        const granter = url.searchParams.get("granter");
        if (!granter?.startsWith("inj1")) {
          return send(req, res, 400, { error: "granter=inj1… query required" });
        }
        const mainnet = url.searchParams.get("mainnet") === "1";
        const fetched = await fetchGranterGrants({
          granter,
          network: mainnet ? "mainnet" : "testnet",
        });
        const report = scoreGrants(granter, fetched.grants);
        return send(req, res, 200, {
          pretty: formatGrantAuditReport(report),
          report,
          endpoint: fetched.endpoint,
        });
      }

      if (req.method === "GET" && path === "/v1/audit/events") {
        if (!isOwner) return send(req, res, 401, { error: "owner authorization required" });
        const sessionId = url.searchParams.get("sessionId");
        let events = gateway.audit.list();
        if (sessionId) {
          events = events.filter(
            (e) => (e.detail as { sessionId?: string })?.sessionId === sessionId,
          );
        }
        return send(req, res, 200, { events });
      }

      return send(req, res, 404, { error: "not found" });
    } catch (err) {
      if (err instanceof HttpError) {
        return send(req, res, err.status, { error: err.message });
      }
      return send(req, res, 500, {
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
