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
import { createGatewayStateStore, type GatewayStateStore } from "../persistence/gatewayStateStore.ts";
import { executeAgentIntent } from "./execute.ts";
import { verifySessionGrantOnChain } from "../authz/verifySessionGrant.ts";
import { assessSessionReadiness } from "../readiness/assessSessionReadiness.ts";
import { ReadinessNetworkRejectedError } from "../readiness/network.ts";
import { assessSessionExposure } from "../exposure/assessSessionExposure.ts";
import { buildGrantTxPlan } from "../authz/buildGrantTx.ts";
import { resolveGrantExpirySeconds } from "../authz/grantExpiry.ts";
import { validateGrantTxPlanAgainstSession } from "../authz/validateGrantTxPlan.ts";
import { safeEqual } from "./auth.ts";
import { RateLimiter } from "./rateLimit.ts";
import { INTENTGUARD_VERSION } from "./version.ts";
import { logJson } from "./log.ts";
import { lcdRestBaseUrl } from "../chain/network.ts";
import { buildOpenApiDocument } from "./openapi.ts";
import { envelopeExecute, envelopePropose } from "../agent/api-envelope.ts";
import { idempotencyGet, idempotencySet } from "./idempotency.ts";
import { ExecutionSafetyStore } from "../execution/executionSafetyStore.ts";
import { orchestrateAgentExecute } from "../execution/executeOrchestrator.ts";
import { recoverExecutionSafetyOnStartup } from "../execution/executionRecovery.ts";
import { SessionExecutionGuard } from "../execution/sessionExecutionGuard.ts";
import type { ProposeApiResponse } from "../agent/api-envelope.ts";
import {
  StateWriteCoordinator,
  StateWriteFrozenError,
  StateWriteShutdownSkippedError,
  WriterLeaseLostError,
} from "../persistence/stateWriteCoordinator.ts";
import {
  STATE_WRITE_FROZEN_ERROR_CODE,
  STATE_WRITE_FROZEN_MESSAGE,
} from "../persistence/stateWriteFreezeEnv.ts";

type ProposeWithProposal = ProposeApiResponse & {
  proposalId?: string;
  proposalExpiresAt?: string;
  intentFingerprint?: string;
};

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
  let store: GatewayStateStore | null = null;
  const gateway = new IntentGuardGateway();
  const limiter = new RateLimiter({
    windowMs: 60_000,
    maxRequests: config.rateLimitPerMinute,
  });
  const agentProposeLimiter = new RateLimiter({
    windowMs: 60_000,
    maxRequests: config.agentProposeRateLimitPerMinute,
  });
  const agentExecuteLimiter = new RateLimiter({
    windowMs: 60_000,
    maxRequests: config.agentExecuteRateLimitPerMinute,
  });

  let shuttingDown = false;
  let inFlight = 0;
  const executionSafety = new ExecutionSafetyStore();
  const sessionExecutionGuard = new SessionExecutionGuard();
  let shutdownPromise: Promise<void> | null = null;
  let startupError: Error | null = null;

  const stateWrite = new StateWriteCoordinator({
    dataDir: config.dataDir,
    requireWriterLease:
      config.requireWriterLease && config.stateBackend !== "gcs",
  });

  async function flushPersist(): Promise<void> {
    if (!store) throw new Error("state store not initialized");
    store.assertMayWrite?.();
    executionSafety.pruneOld(7 * 24 * 60 * 60 * 1000);
    const execution = executionSafety.exportState();
    await store.save(gateway.exportSessions(), gateway.audit.list(), execution);
  }

  function persist(opts?: { shutdownFlush?: boolean }): Promise<void> {
    return stateWrite
      .enqueuePersist(() => {
        return flushPersist();
      }, opts)
      .catch((err) => {
        if (err instanceof StateWriteShutdownSkippedError) {
          throw err;
        }
        logJson("error", "persist_failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      });
  }

  /** Await durable state.json write (serialized with other persist calls). */
  function persistNow(opts?: { shutdownFlush?: boolean }): Promise<void> {
    return persist(opts);
  }

  async function hydrateAndRecover(): Promise<void> {
    store = await createGatewayStateStore(config, stateWrite.holderId);
    if (config.stateBackend === "gcs" && config.requireGcsState && store.backend !== "gcs") {
      throw new Error("hosted configuration requires GCS state backend");
    }
    await stateWrite.startupAcquireLease();
    const state = await store.load();
    for (const s of state.sessions) gateway.importSession(s);
    gateway.audit.replaceAll(state.audit);
    executionSafety.importState({
      proposals: state.proposals,
      executeIdempotency: state.executeIdempotency,
    });
  if (stateWrite.isFrozen()) {
      return;
    }
    stateWrite.beginMutation();
    try {
      recoverExecutionSafetyOnStartup(executionSafety, gateway.audit);
    } finally {
      stateWrite.endMutation();
    }
    await persist();
  }

  const startupReady = hydrateAndRecover().catch((err) => {
    startupError = err instanceof Error ? err : new Error(String(err));
    logJson("error", "startup_failed", { error: startupError.message });
  });

  logJson("info", "startup", {
    version: INTENTGUARD_VERSION,
    bindHost: config.bindHost,
    port: config.port,
    dataDir: config.dataDir,
    network: config.network,
    stateBackend: config.stateBackend,
    gcsStateObject: config.gcsStateBucket
      ? `gs://${config.gcsStateBucket}/${config.gcsStateObject}`
      : undefined,
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

    if (startupError) {
      send(req, res, 503, {
        error: "gateway startup failed",
        detail: startupError.message,
      });
      return;
    }
    await startupReady;

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
          productName: "Fence",
          service: "intentguard-gateway",
          version: INTENTGUARD_VERSION,
          executeEnabled: config.executeEnabled,
          executionMaintenance: config.executionMaintenance,
          stateWriteFreeze: stateWrite.isFrozen(),
          stateWriteStatus: stateWrite.status(),
          stateBackend: store?.backend ?? config.stateBackend,
          stateLocation: store?.location,
          network: config.network,
          requireOnChainGrant: config.requireOnChainGrant,
          requireExecuteReadiness: config.requireExecuteReadiness,
          encryptionAtRest: Boolean(config.dataKey),
          sessions: gateway.exportSessions().length,
          requestId,
        });
      }

      if (req.method === "GET" && path === "/health/live") {
        return send(req, res, 200, {
          ok: !shuttingDown,
          productName: "Fence",
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
        const ready =
          dataDirOk && lcdOk && !shuttingDown && !startupError;
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

      if (req.method === "POST" && path === "/v1/owner/state-write/freeze") {
        if (!isOwner) {
          return send(req, res, 401, { error: "owner authorization required" });
        }
        stateWrite.beginMutation();
        try {
          gateway.audit.append("state_write_frozen", "Operator state write freeze", {});
        } finally {
          stateWrite.endMutation();
        }
        await persist();
        const result = await stateWrite.freeze();
        return send(req, res, 200, {
          ...result,
          stateWriteStatus: stateWrite.status(),
        });
      }

      if (req.method === "POST" && path === "/v1/owner/state-write/unfreeze") {
        if (!isOwner) {
          return send(req, res, 401, { error: "owner authorization required" });
        }
        stateWrite.unfreeze();
        stateWrite.beginMutation();
        try {
          gateway.audit.append("state_write_unfrozen", "Operator state write unfreeze", {});
        } finally {
          stateWrite.endMutation();
        }
        await persist();
        return send(req, res, 200, { stateWriteStatus: stateWrite.status() });
      }

      if (req.method === "GET" && path === "/v1/owner/state-write/status") {
        if (!isOwner) return send(req, res, 401, { error: "owner authorization required" });
        return send(req, res, 200, { stateWriteStatus: stateWrite.status() });
      }

      if (req.method === "POST" && path === "/v1/owner/rotate-api-key") {
        if (!isOwner) {
          return send(req, res, 401, { error: "owner authorization required" });
        }
        stateWrite.beginMutation();
        try {
          ownerApiKey = rotateOwnerApiKey(config.configPath);
          gateway.audit.append("owner_key_rotated", "Owner HTTP API key rotated", {});
        } finally {
          stateWrite.endMutation();
        }
        await persist();
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

        stateWrite.beginMutation();
        let view;
        let agent;
        try {
          ({ view, agent } = gateway.createSession({
            policy: body.policy,
            granteeAddress,
            granteePrivateKeyHex: granteePk.toPrivateKeyHex().replace(/^0x/, ""),
            ownerInjectiveAddress: body.ownerInjectiveAddress,
            subaccountId,
            subaccountIndex: subIndex,
            grantExpirySeconds,
          }));
        } finally {
          stateWrite.endMutation();
        }

        const plan = planTradingGrant({
          granteeAddress,
          subaccountId,
          policy: body.policy,
          expirySeconds: grantExpirySeconds,
        });

        await persist();

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

      const readinessMatch = path.match(/^\/v1\/sessions\/([^/]+)\/readiness$/);
      if (req.method === "GET" && readinessMatch) {
        if (!isOwner) return send(req, res, 401, { error: "owner authorization required" });
        const id = readinessMatch[1]!;
        const session = gateway.getSessionRecord(id);
        if (!session) return send(req, res, 404, { error: "session not found" });
        if (session.revoked) {
          return send(req, res, 410, {
            error: "session revoked",
            sessionId: id,
          });
        }
        const mainnet = url.searchParams.get("mainnet") === "1";
        const marketId = url.searchParams.get("marketId") ?? undefined;
        try {
          const readiness = await assessSessionReadiness({
            session,
            network: mainnet ? "mainnet" : config.network,
            marketId,
            executeEnabled: config.executeEnabled,
          });
          return send(req, res, 200, readiness as unknown as Json);
        } catch (e) {
          if (e instanceof ReadinessNetworkRejectedError) {
            return send(req, res, 400, {
              error: e.message,
              supportedNetworks: ["testnet"],
            });
          }
          throw e;
        }
      }

      const exposureMatch = path.match(/^\/v1\/sessions\/([^/]+)\/exposure$/);
      if (req.method === "GET" && exposureMatch) {
        if (!isOwner) return send(req, res, 401, { error: "owner authorization required" });
        const id = exposureMatch[1]!;
        const session = gateway.getSessionRecord(id);
        if (!session) return send(req, res, 404, { error: "session not found" });
        if (session.revoked) {
          return send(req, res, 410, {
            error: "session revoked",
            sessionId: id,
          });
        }
        const mainnet = url.searchParams.get("mainnet") === "1";
        if (url.searchParams.has("subaccountId")) {
          return send(req, res, 400, {
            error: "subaccountId query not allowed — session subaccount is used",
          });
        }
        try {
          const exposure = await assessSessionExposure({
            session,
            network: mainnet ? "mainnet" : config.network,
          });
          return send(req, res, 200, exposure as unknown as Json);
        } catch (e) {
          if (e instanceof ReadinessNetworkRejectedError) {
            return send(req, res, 400, {
              error: e.message,
              supportedNetworks: ["testnet"],
            });
          }
          throw e;
        }
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
        const expRaw = url.searchParams.get("expirySeconds");
        const queryExpiry =
          expRaw != null && expRaw.trim() !== "" ? Number(expRaw) : null;
        const resolved = resolveGrantExpirySeconds({
          queryExpirySeconds: queryExpiry,
          sessionGrantExpirySeconds: session.grantExpirySeconds,
        });
        if (!resolved.ok) {
          return send(req, res, 400, {
            error: resolved.error,
            code: resolved.code,
          });
        }
        const plan = planTradingGrant({
          granteeAddress: session.granteeAddress,
          subaccountId: session.subaccountId,
          policy: session.policy,
          expirySeconds: resolved.expirySeconds,
        });
        const txPlan = buildGrantTxPlan({
          granter: session.ownerInjectiveAddress,
          grantee: session.granteeAddress,
          plan,
        });
        const validation = validateGrantTxPlanAgainstSession({
          sessionId: id,
          ownerInjectiveAddress: session.ownerInjectiveAddress,
          granteeAddress: session.granteeAddress,
          subaccountId: session.subaccountId,
          policy: session.policy,
          grantPlan: plan,
          txPlan: {
            expirationUnix: txPlan.expirationUnix,
            expirationIso: txPlan.expirationIso,
            msgGrants: txPlan.msgGrants as import("../authz/validateGrantTxPlan.ts").WireMsgGrant[],
          },
        });
        if (!validation.ok) {
          return send(req, res, 500, {
            error: "grant tx plan failed validation",
            issues: validation.errors,
          });
        }
        return send(req, res, 200, {
          sessionId: id,
          grantPlan: plan,
          txPlan,
          expirySeconds: resolved.expirySeconds,
          planGeneratedAt: new Date().toISOString(),
          expiryTimezone: "UTC (expirationIso is on-chain authz expiry)",
          scopeNote:
            "v0: derivative limit + cancel only — gateway enforces notional/leverage",
        });
      }

      const revokeMatch = path.match(/^\/v1\/sessions\/([^/]+)\/revoke$/);
      if (req.method === "POST" && revokeMatch) {
        if (!isOwner) return send(req, res, 401, { error: "owner authorization required" });
        const id = revokeMatch[1]!;
        const inFlightPhase = sessionExecutionGuard.signalRevokeDuringExecute(id);
        const hold = sessionExecutionGuard.getHold(id);
        if (inFlightPhase === "broadcasting") {
          gateway.audit.append(
            "revoke_during_broadcast",
            "Session revoked while execute may have submitted a chain transaction — revocation cannot cancel an already broadcast tx",
            { sessionId: id, proposalId: hold?.proposalId, idempotencyKeyHash: hold?.idempotencyKeyHash },
          );
        } else if (inFlightPhase === "claimed") {
          gateway.audit.append("revoke_during_execute", "Session revoked before broadcast boundary", {
            sessionId: id,
            proposalId: hold?.proposalId,
            revokeSignaled: true,
          });
        }
        stateWrite.beginMutation();
        let view;
        try {
          view = gateway.revoke(id);
        } finally {
          stateWrite.endMutation();
        }
        await persist();
        return send(req, res, 200, {
          session: view,
          revoked: true,
          executeInFlight: hold
            ? {
                phase: hold.phase,
                proposalId: hold.proposalId,
                note:
                  hold.phase === "broadcasting"
                    ? "A chain transaction may already have been submitted; revocation clears grantee key but cannot recall an on-chain tx."
                    : "In-flight execute should fail closed on the next pre-broadcast gate.",
              }
            : undefined,
        });
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
        const agentRetry = agentProposeLimiter.check(`propose:${token}`);
        if (agentRetry !== null) {
          return send(req, res, 429, {
            error: "agent propose rate limit exceeded",
            retryAfterSeconds: agentRetry,
          });
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
        stateWrite.beginMutation();
        let enveloped: ReturnType<typeof envelopePropose>;
        try {
          const result = gateway.propose(
            { role: "agent", apiToken: token },
            body.intent,
          );
          enveloped = envelopePropose(
            result as unknown as Record<string, unknown>,
          );
          if (
            enveloped.status === "allowed" &&
            boundSession &&
            boundSession.subaccountId
          ) {
            const proposal = executionSafety.createApprovedProposal({
              sessionId: boundSession.sessionId,
              agentApiToken: token,
              policy: boundSession.policy,
              intent: body.intent,
              subaccountId: boundSession.subaccountId,
            });
            gateway.audit.append("proposal_created", "Short-lived execute approval", {
              sessionId: boundSession.sessionId,
              proposalId: proposal.proposalId,
              intentFingerprint: proposal.intentFingerprint,
              expiresAt: proposal.expiresAt,
            });
            (enveloped as ProposeWithProposal).proposalId = proposal.proposalId;
            (enveloped as ProposeWithProposal).proposalExpiresAt = proposal.expiresAt;
            (enveloped as ProposeWithProposal).intentFingerprint =
              proposal.intentFingerprint;
          }
          if (idemKey && enveloped.sessionId) {
            idempotencySet(enveloped.sessionId, idemKey, enveloped);
          }
        } finally {
          stateWrite.endMutation();
        }
        await persist();
        return send(req, res, 200, enveloped as unknown as Json);
      }

      if (req.method === "POST" && path === "/v1/execute") {
        const token = bearer(req);
        if (!token?.startsWith("agt_")) {
          return send(req, res, 401, { error: "agent Bearer agt_… required" });
        }
        const agentRetry = agentExecuteLimiter.check(`execute:${token}`);
        if (agentRetry !== null) {
          return send(req, res, 429, {
            error: "agent execute rate limit exceeded",
            retryAfterSeconds: agentRetry,
          });
        }
        const body = (await readBody(req, config.maxBodyBytes)) as {
          intent?: TradeIntent;
          proposalId?: string;
        };
        if (!body.intent?.marketId) {
          return send(req, res, 400, { error: "intent.marketId required" });
        }
        const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
        const outcome = await orchestrateAgentExecute({
          agentApiToken: token,
          idempotencyKeyRaw: idempotencyKey,
          proposalId: body.proposalId ?? "",
          intent: body.intent,
          deps: {
            gateway,
            safety: executionSafety,
            audit: gateway.audit,
            config: {
              executeEnabled: config.executeEnabled,
              executionMaintenance: config.executionMaintenance,
              ownerPrivateKeyHex: config.ownerPrivateKeyHex,
              requireOnChainGrant: config.requireOnChainGrant,
              requireExecuteReadiness: config.requireExecuteReadiness,
              network: config.network,
            },
            persistNow,
            sessionGuard: sessionExecutionGuard,
            stateWrite,
          },
        });
        await persist();
        return send(req, res, outcome.httpStatus, outcome.body as Json);
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
      if (err instanceof StateWriteFrozenError) {
        return send(req, res, 503, {
          error: err.message,
          errorCode: STATE_WRITE_FROZEN_ERROR_CODE,
        });
      }
      if (err instanceof WriterLeaseLostError) {
        return send(req, res, 503, {
          error: err.message,
          errorCode: err.code,
        });
      }
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
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    shutdownPromise = (async () => {
      logJson("info", "shutdown", { inFlight });
      await new Promise<void>((resolve) => server.close(() => resolve()));
      const deadline = Date.now() + 30_000;
      while (inFlight > 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      try {
        await stateWrite.waitForPersistIdle();
        await persist({ shutdownFlush: true });
        await stateWrite.shutdownReleaseLease();
      } catch (err) {
        if (err instanceof StateWriteShutdownSkippedError) {
          logJson("info", "shutdown_persist_skipped", {
            reason: err.code,
            message: err.message,
          });
        } else {
          logJson("error", "shutdown_persist_failed", {
            error: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      }
      logJson("info", "shutdown_complete", {});
    })();
    return shutdownPromise;
  }

  server.listen(config.port, config.bindHost, () => {
    console.log(
      `Fence gateway listening on http://${config.bindHost}:${config.port}`,
    );
    console.log(`Data: ${config.dataDir}`);
    console.log(`OpenAPI: http://127.0.0.1:${config.port}/v1/openapi.json`);
  });

  return { server, config, gateway, persist, shutdown, stateWrite, startupReady };
}
