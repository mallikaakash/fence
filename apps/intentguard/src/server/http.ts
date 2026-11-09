import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync } from "node:fs";
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
import { INTENTGUARD_VERSION } from "./version.ts";
import { logJson } from "./log.ts";
import { lcdRestBaseUrl } from "../chain/network.ts";
import { buildOpenApiDocument } from "./openapi.ts";
import { envelopeExecute, envelopePropose } from "../agent/api-envelope.ts";
import { idempotencyGet, idempotencySet } from "./idempotency.ts";

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
  requestId?: string,
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
  if (requestId) headers["x-request-id"] = requestId;
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

  let shuttingDown = false;
  let inFlight = 0;
  let persistQueue = Promise.resolve();

  function persist(): Promise<void> {
    persistQueue = persistQueue.then(() => {
      store.save(gateway.exportSessions(), gateway.audit.list());
    });
    return persistQueue;
  }

  function hydrate() {
    const state = store.load();
    for (const s of state.sessions) gateway.importSession(s);
    gateway.audit.replaceAll(state.audit);
  }

  hydrate();

  logJson("info", "startup", {
    version: INTENTGUARD_VERSION,
    bindHost: config.bindHost,
    port: config.port,
    dataDir: config.dataDir,
    network: config.network,
  });

  const server = createServer(async (req, res) => {
    const started = Date.now();
    const requestId =
      (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
    const send = (
      r: IncomingMessage,
      res: ServerResponse,
      status: number,
      body: Json,
    ) => sendJson(r, res, config, status, body, requestId);

    if (shuttingDown) {
      send(req, res, 503, { error: "shutting down" });
      logJson("info", "request", {
        requestId,
        method: req.method,
        path: req.url?.split("?")[0] ?? "",
        status: 503,
        durationMs: Date.now() - started,
      });
      return;
    }

    inFlight++;
    let path = "";
    try {
    if (!req.url || !req.method) return send(req, res, 400, { error: "bad request" });

    if (req.method === "OPTIONS") return send(req, res, 204, {});

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    path = url.pathname;
    const clientIp = req.socket.remoteAddress ?? "unknown";
    const rateKey = `${clientIp}:${path.split("/").slice(0, 3).join("/")}`;
    const retry = limiter.check(rateKey);
    if (retry !== null) {
      return send(req, res, 429, {
        error: "rate limit exceeded",
        retryAfterSeconds: retry,
      });
    }

      if (req.method === "GET" && path === "/health") {
        return send(req, res, 200, {
          ok: true,
          service: "intentguard-gateway",
          version: INTENTGUARD_VERSION,
          executeEnabled: config.executeEnabled,
          network: config.network,
          requireOnChainGrant: config.requireOnChainGrant,
          encryptionAtRest: Boolean(config.dataKey),
          sessions: gateway.exportSessions().length,
          requestId,
        });
      }

      if (req.method === "GET" && path === "/health/live") {
        return send(req, res, 200, {
          ok: !shuttingDown,
          service: "intentguard-gateway",
        });
      }

      if (req.method === "GET" && path === "/health/ready") {
        const dataDirOk = existsSync(config.dataDir);
        let lcdOk = true;
        if (process.env.INTENTGUARD_READY_LCD === "1") {
          const lcdRest = lcdRestBaseUrl(config.network);
          try {
            const probe = await fetch(`${lcdRest}/cosmos/base/tendermint/v1beta1/blocks/latest`, {
              signal: AbortSignal.timeout(5_000),
            });
            lcdOk = probe.ok;
          } catch {
            lcdOk = false;
          }
        }
        const ready = dataDirOk && lcdOk && !shuttingDown;
        return send(req, res, ready ? 200 : 503, {
          ok: ready,
          dataDir: config.dataDir,
          dataDirWritable: dataDirOk,
          lcdReachable: lcdOk,
          sessions: gateway.exportSessions().length,
          encryptionAtRest: Boolean(config.dataKey),
        });
      }

      if (req.method === "GET" && path === "/v1/openapi.json") {
        return send(req, res, 200, buildOpenApiDocument() as Json);
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
          grantExpirySeconds?: number;
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

        const grantExpirySeconds =
          typeof body.grantExpirySeconds === "number" &&
          body.grantExpirySeconds > 60
            ? Math.floor(body.grantExpirySeconds)
            : undefined;

        const { view, agent } = gateway.createSession({
          policy: body.policy,
          granteeAddress,
          granteePrivateKeyHex: granteePk.toPrivateKeyHex().replace(/^0x/, ""),
          ownerInjectiveAddress: body.ownerInjectiveAddress,
          subaccountId,
          subaccountIndex: subIndex,
          grantExpirySeconds,
        });

        const plan = planTradingGrant({
          granteeAddress,
          subaccountId,
          policy: body.policy,
          expirySeconds: grantExpirySeconds,
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
          expirySeconds: session.grantExpirySeconds,
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

      if (req.method === "GET" && path === "/v1/agent/session") {
        const token = bearer(req);
        if (!token?.startsWith("agt_")) {
          return send(req, res, 401, { error: "agent Bearer agt_… required" });
        }
        const summary = gateway.getAgentSessionSummary(token);
        if (!summary) {
          return send(req, res, 404, { error: "unknown agent token" });
        }
        return send(req, res, 200, {
          ...summary,
          executeEnabled: config.executeEnabled,
          network: config.network,
        });
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
        const idemKey = req.headers["idempotency-key"] as string | undefined;
        const boundSession = gateway.getSessionForAgent(token);
        if (idemKey && boundSession?.sessionId) {
          const cached = idempotencyGet(boundSession.sessionId, idemKey);
          if (cached) {
            return send(req, res, 200, {
              ...(cached as Json),
              idempotentReplay: true,
            });
          }
        }
        const result = gateway.propose(
          { role: "agent", apiToken: token },
          body.intent,
        );
        const enveloped = envelopePropose(
          result as unknown as Record<string, unknown>,
        );
        if (idemKey && enveloped.sessionId) {
          idempotencySet(enveloped.sessionId, idemKey, enveloped);
        }
        persist();
        return send(req, res, 200, enveloped as unknown as Json);
      }

      if (req.method === "POST" && path === "/v1/execute") {
        const token = bearer(req);
        if (!token?.startsWith("agt_")) {
          return send(req, res, 401, { error: "agent Bearer agt_… required" });
        }
        if (!config.executeEnabled) {
          return send(req, res, 503, {
            error: "execute disabled — operator must enable INTENTGUARD_EXECUTE on gateway",
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
          ownerPrivateKeyHex: config.ownerPrivateKeyHex ?? null,
          requireOnChainGrant: config.requireOnChainGrant,
          network: config.network,
        });
        persist();
        return send(
          req,
          res,
          200,
          envelopeExecute(result as unknown as Record<string, unknown>) as unknown as Json,
        );
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
      logJson("error", "request_error", {
        requestId,
        path,
        error: err instanceof Error ? err.message : String(err),
      });
      return send(req, res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      inFlight--;
      logJson("info", "request", {
        requestId,
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Date.now() - started,
      });
    }
  });

  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logJson("info", "shutdown", { inFlight });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const deadline = Date.now() + 30_000;
    while (inFlight > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await persistQueue;
    store.save(gateway.exportSessions(), gateway.audit.list());
    logJson("info", "shutdown_complete", {});
  }

  server.listen(config.port, config.bindHost, () => {
    console.log(
      `IntentGuard gateway listening on http://${config.bindHost}:${config.port}`,
    );
    console.log(`Data: ${config.dataDir}`);
    console.log(`OpenAPI: http://127.0.0.1:${config.port}/v1/openapi.json`);
  });

  return { server, config, gateway, persist, shutdown };
}
