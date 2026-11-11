import type { IntentGuardGateway } from "../gateway/session.ts";
import type { GatewayConfig } from "../server/config.ts";
import type { TradeIntent } from "../policy/types.ts";
import { evaluateTradeIntent } from "../policy/evaluate.ts";
import { verifySessionGrantOnChain } from "../authz/verifySessionGrant.ts";
import { executeAgentIntent } from "../server/execute.ts";
import { envelopeExecute } from "../agent/api-envelope.ts";
import type { AuditLog } from "../gateway/audit.ts";
import { AsyncLock } from "./asyncLock.ts";
import {
  executeRequestFingerprint,
  hashIdempotencyKey,
  policyFingerprint,
  tradeIntentFingerprint,
  agentTokenFingerprint,
} from "./fingerprints.ts";
import type { ExecutionSafetyStore } from "./executionSafetyStore.ts";
import type { ExecuteIdempotencyRecord } from "./types.ts";
import { validateIdempotencyKey } from "./config.ts";
import { assertHostedExecuteAuthzConfig, shouldVerifyAuthzAtExecute } from "./authzConfig.ts";
import { assertSessionExecutableForBroadcast } from "./sessionGate.ts";
import type { SessionExecutionGuard } from "./sessionExecutionGuard.ts";
import {
  EXECUTION_MAINTENANCE_ERROR_CODE,
  EXECUTION_MAINTENANCE_MESSAGE,
  isExecutionMaintenanceEnabled,
} from "./executionMaintenance.ts";
import type { StateWriteCoordinator } from "../persistence/stateWriteCoordinator.ts";
import {
  STATE_WRITE_FROZEN_ERROR_CODE,
  STATE_WRITE_FROZEN_MESSAGE,
} from "../persistence/stateWriteFreezeEnv.ts";
import {
  assertExecuteReadinessForBroadcast,
  type ExecuteReadinessGateResult,
} from "./executeReadinessGate.ts";

export type ExecuteHttpOutcome = {
  httpStatus: number;
  body: Record<string, unknown>;
  /** When set, caller must await durable persist before sending HTTP response. */
  needsPersist?: boolean;
};

export type ExecuteOrchestratorDeps = {
  gateway: IntentGuardGateway;
  safety: ExecutionSafetyStore;
  audit: AuditLog;
  config: Pick<GatewayConfig, "executeEnabled" | "requireOnChainGrant" | "network"> & {
    requireExecuteReadiness?: boolean;
    ownerPrivateKeyHex?: string | null;
    executionMaintenance?: boolean;
  };
  /** Test override for execute readiness gate (chain queries). */
  executeReadinessGate?: (
    params: Parameters<typeof assertExecuteReadinessForBroadcast>[0],
  ) => Promise<ExecuteReadinessGateResult>;
  /** When set (tests), overrides config/env for maintenance checks at each gate. */
  executionMaintenanceProbe?: () => boolean;
  runChainExecute?: (
    params: Parameters<typeof executeAgentIntent>[0],
  ) => ReturnType<typeof executeAgentIntent>;
  nowMs?: () => number;
  lock?: AsyncLock;
  /** Await durable state.json flush at critical execution checkpoints. */
  persistNow?: () => Promise<void>;
  sessionGuard?: SessionExecutionGuard;
  stateWrite?: Pick<
    StateWriteCoordinator,
    "isFrozen" | "assertMutationAllowed" | "beginMutation" | "endMutation"
  >;
};

const globalLock = new AsyncLock();

function terminalSuccess(state: ExecuteIdempotencyRecord["state"]): boolean {
  return (
    state === "completed" ||
    state === "confirmed" ||
    state === "broadcast_unknown"
  );
}

function inProgress(state: ExecuteIdempotencyRecord["state"]): boolean {
  return (
    state === "processing" ||
    state === "broadcast_pending" ||
    state === "broadcasted"
  );
}

async function durablePersist(
  persistNow: (() => Promise<void>) | undefined,
): Promise<ExecuteHttpOutcome | null> {
  if (!persistNow) return null;
  try {
    await persistNow();
    return null;
  } catch (e) {
    return {
      httpStatus: 503,
      body: {
        error: "execution state persistence failed — broadcast aborted",
        errorCode: "persist_failed",
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

function failBeforeBroadcast(
  safety: ExecutionSafetyStore,
  proposalId: string,
  idempotencyKeyHash: string,
  record: ExecuteIdempotencyRecord,
  nowIso: string,
  message: string,
): ExecuteIdempotencyRecord {
  safety.finalizeProposalConsume(proposalId, idempotencyKeyHash, "release");
  record.state = "failed_before_broadcast";
  record.message = message;
  record.updatedAt = nowIso;
  safety.upsertIdempotency(record);
  return record;
}

function executionMaintenanceActive(deps: ExecuteOrchestratorDeps): boolean {
  if (deps.executionMaintenanceProbe) {
    return deps.executionMaintenanceProbe();
  }
  if (deps.config.executionMaintenance !== undefined) {
    return deps.config.executionMaintenance;
  }
  return isExecutionMaintenanceEnabled();
}

function stateWriteFrozenOutcome(
  audit: AuditLog,
  sessionId: string,
  proposalId: string,
  idempotencyKeyHash: string,
): ExecuteHttpOutcome {
  audit.append("state_write_frozen_rejected", STATE_WRITE_FROZEN_MESSAGE, {
    sessionId,
    proposalId,
    idempotencyKeyHash,
  });
  return {
    httpStatus: 503,
    body: {
      error: STATE_WRITE_FROZEN_MESSAGE,
      errorCode: STATE_WRITE_FROZEN_ERROR_CODE,
    },
  };
}

function maintenanceRejectedOutcome(
  audit: AuditLog,
  sessionId: string,
  proposalId: string,
  idempotencyKeyHash: string,
): ExecuteHttpOutcome {
  audit.append("execute_maintenance_rejected", EXECUTION_MAINTENANCE_MESSAGE, {
    sessionId,
    proposalId,
    idempotencyKeyHash,
  });
  return {
    httpStatus: 503,
    body: {
      error: EXECUTION_MAINTENANCE_MESSAGE,
      errorCode: EXECUTION_MAINTENANCE_ERROR_CODE,
    },
  };
}

export async function orchestrateAgentExecute(params: {
  agentApiToken: string;
  idempotencyKeyRaw: string | undefined;
  proposalId: string;
  intent: TradeIntent;
  deps: ExecuteOrchestratorDeps;
}): Promise<ExecuteHttpOutcome> {
  const {
    gateway,
    safety,
    audit,
    config,
    runChainExecute = executeAgentIntent,
    nowMs = () => Date.now(),
    lock = globalLock,
    persistNow,
    sessionGuard,
    stateWrite,
  } = params.deps;

  const idemKey = validateIdempotencyKey(params.idempotencyKeyRaw);
  if (!idemKey) {
    return {
      httpStatus: 400,
      body: {
        error: "Idempotency-Key header required (1–128 printable ASCII chars)",
        errorCode: "idempotency_key_required",
      },
    };
  }

  if (!params.proposalId?.startsWith("prp_")) {
    return {
      httpStatus: 400,
      body: {
        error: "proposalId required (from POST /v1/propose when allowed)",
        errorCode: "proposal_id_required",
      },
    };
  }

  const session = gateway.getSessionForAgent(params.agentApiToken);
  if (!session) {
    return {
      httpStatus: 404,
      body: { error: "unknown agent token", errorCode: "unknown_agent" },
    };
  }

  const idempotencyKeyHash = hashIdempotencyKey(session.sessionId, idemKey);
  const subaccountId = safety.resolveSubaccountId(
    gateway,
    session.sessionId,
    session.subaccountId,
  );
  const intentFp = tradeIntentFingerprint(params.intent, {
    sessionId: session.sessionId,
    subaccountId,
    orderType: "derivative_limit",
  });
  const requestFingerprint = executeRequestFingerprint({
    proposalId: params.proposalId,
    intentFingerprint: intentFp,
  });

  audit.append("execute_request_received", "Agent execute request", {
    sessionId: session.sessionId,
    proposalId: params.proposalId,
    idempotencyKeyHash,
    requestFingerprint,
  });

  return lock.run(
    `exec:${session.sessionId}:${idempotencyKeyHash}`,
    async () => {
      let sessionHoldAcquired = false;
      let mutationHeld = false;
      try {
        if (stateWrite?.isFrozen()) {
          return stateWriteFrozenOutcome(
            audit,
            session.sessionId,
            params.proposalId,
            idempotencyKeyHash,
          );
        }
        const existing = safety.getIdempotency(session.sessionId, idempotencyKeyHash);
        if (existing) {
          if (existing.requestFingerprint !== requestFingerprint) {
            audit.append("idempotency_conflict", "Idempotency key payload mismatch", {
              sessionId: session.sessionId,
              idempotencyKeyHash,
              requestFingerprint,
            });
            return {
              httpStatus: 409,
              body: {
                error: "Idempotency-Key reused with different execute payload",
                errorCode: "idempotency_payload_conflict",
                executionState: existing.state,
              },
            };
          }
          if (
            (existing.state === "completed" || existing.state === "confirmed") &&
            existing.result
          ) {
            audit.append("idempotency_replay", "Returning stored execute result", {
              sessionId: session.sessionId,
              idempotencyKeyHash,
              proposalId: existing.proposalId,
            });
            return {
              httpStatus: 200,
              body: {
                ...existing.result,
                idempotentReplay: true,
                executionState: existing.state,
              },
            };
          }
          if (existing.state === "broadcast_unknown" && existing.result) {
            return {
              httpStatus: existing.result.errorCode === "broadcast_unknown" ? 503 : 200,
              body: {
                ...existing.result,
                idempotentReplay: true,
                executionState: existing.state,
                warning:
                  "broadcast outcome unknown — reconcile via txHash before retrying with a new key",
              },
            };
          }
          if (inProgress(existing.state)) {
            return {
              httpStatus: 409,
              body: {
                error: "Execute already in progress for this Idempotency-Key",
                errorCode: "execute_in_progress",
                executionState: existing.state,
              },
            };
          }
          if (existing.state === "failed_before_broadcast" && existing.result) {
            return {
              httpStatus: 200,
              body: {
                ...existing.result,
                idempotentReplay: true,
                executionState: existing.state,
              },
            };
          }
          if (terminalSuccess(existing.state) && existing.result) {
            return {
              httpStatus: 200,
              body: {
                ...existing.result,
                idempotentReplay: true,
                executionState: existing.state,
              },
            };
          }
        }

        const proposal = safety.getProposal(params.proposalId);
        if (!proposal) {
          return {
            httpStatus: 404,
            body: { error: "unknown proposalId", errorCode: "proposal_not_found" },
          };
        }

        safety.expireProposalIfNeeded(proposal, nowMs());
        const proposalFresh = safety.getProposal(params.proposalId)!;

        if (proposalFresh.sessionId !== session.sessionId) {
          return {
            httpStatus: 403,
            body: {
              error: "proposal session mismatch",
              errorCode: "proposal_session_mismatch",
            },
          };
        }

        if (
          proposalFresh.agentTokenFingerprint !==
          agentTokenFingerprint(params.agentApiToken)
        ) {
          return {
            httpStatus: 403,
            body: { error: "proposal agent mismatch", errorCode: "proposal_agent_mismatch" },
          };
        }

        if (proposalFresh.intentFingerprint !== intentFp) {
          return {
            httpStatus: 409,
            body: {
              error: "execute intent does not match approved proposal",
              errorCode: "intent_mismatch",
            },
          };
        }

        const currentPolicyFp = policyFingerprint(session.policy);
        if (proposalFresh.policyFingerprint !== currentPolicyFp) {
          audit.append(
            "execute_policy_fingerprint_stale",
            "Policy changed since proposal — new proposal required",
            {
              sessionId: session.sessionId,
              proposalId: params.proposalId,
              proposalFingerprint: proposalFresh.policyFingerprint,
              currentFingerprint: currentPolicyFp,
            },
          );
          return {
            httpStatus: 409,
            body: {
              error:
                "session policy changed since proposal — POST /v1/propose again for a new proposalId",
              errorCode: "policy_fingerprint_stale",
            },
          };
        }

        if (
          (proposalFresh.status === "consumed" ||
            proposalFresh.status === "confirmed") &&
          proposalFresh.consumedByIdempotencyKeyHash === idempotencyKeyHash
        ) {
          const again = safety.getIdempotency(session.sessionId, idempotencyKeyHash);
          if (again?.result) {
            return { httpStatus: 200, body: { ...again.result, idempotentReplay: true } };
          }
        }

        if (proposalFresh.status === "consumed" || proposalFresh.status === "confirmed") {
          return {
            httpStatus: 409,
            body: {
              error: "proposal already consumed",
              errorCode: "proposal_consumed",
              consumedByIdempotencyKeyHash: proposalFresh.consumedByIdempotencyKeyHash,
            },
          };
        }

        if (proposalFresh.status === "expired") {
          audit.append("proposal_expired", "Expired proposal execute attempt", {
            sessionId: session.sessionId,
            proposalId: params.proposalId,
          });
          return {
            httpStatus: 410,
            body: { error: "proposal expired", errorCode: "proposal_expired" },
          };
        }

        if (proposalFresh.status !== "approved") {
          return {
            httpStatus: 409,
            body: {
              error: `proposal not executable (status=${proposalFresh.status})`,
              errorCode: "proposal_not_approved",
            },
          };
        }

        if (executionMaintenanceActive(params.deps)) {
          return maintenanceRejectedOutcome(
            audit,
            session.sessionId,
            params.proposalId,
            idempotencyKeyHash,
          );
        }

        if (stateWrite?.isFrozen()) {
          return stateWriteFrozenOutcome(
            audit,
            session.sessionId,
            params.proposalId,
            idempotencyKeyHash,
          );
        }
        stateWrite?.assertMutationAllowed();
        stateWrite?.beginMutation();
        mutationHeld = true;

        const claim = safety.tryBeginProposalConsume(params.proposalId, idempotencyKeyHash);
        if (!claim.ok) {
          if (claim.code === "proposal_already_consumed") {
            const stored = safety.getIdempotency(session.sessionId, idempotencyKeyHash);
            if (stored?.result) {
              return { httpStatus: 200, body: { ...stored.result, idempotentReplay: true } };
            }
          }
          return {
            httpStatus: 409,
            body: { error: claim.reason, errorCode: claim.code },
          };
        }

        const nowIso = new Date(nowMs()).toISOString();
        const record: ExecuteIdempotencyRecord = {
          idempotencyKeyHash,
          sessionId: session.sessionId,
          requestFingerprint,
          proposalId: params.proposalId,
          state: "processing",
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        safety.upsertIdempotency(record);
        safety.transitionProposalStatus(params.proposalId, "consuming", nowIso);
        audit.append("execute_claimed", "Proposal + idempotency claimed", {
          sessionId: session.sessionId,
          proposalId: params.proposalId,
          idempotencyKeyHash,
        });

        const persistAfterClaim = await durablePersist(persistNow);
        if (persistAfterClaim) {
          failBeforeBroadcast(
            safety,
            params.proposalId,
            idempotencyKeyHash,
            record,
            new Date(nowMs()).toISOString(),
            "persistence failed after claim",
          );
          await durablePersist(persistNow);
          return persistAfterClaim;
        }

        if (sessionGuard) {
          const hold = sessionGuard.tryAcquire(
            session.sessionId,
            params.proposalId,
            idempotencyKeyHash,
          );
          if (!hold.ok) {
            failBeforeBroadcast(
              safety,
              params.proposalId,
              idempotencyKeyHash,
              record,
              new Date(nowMs()).toISOString(),
              "session execute already in flight",
            );
            await durablePersist(persistNow);
            return {
              httpStatus: 409,
              body: {
                error: "another execute is in progress for this session",
                errorCode: "session_execute_in_progress",
                inFlightProposalId: hold.proposalId,
                inFlightPhase: hold.phase,
              },
            };
          }
          sessionHoldAcquired = true;
        }

        if (!config.executeEnabled) {
          failBeforeBroadcast(
            safety,
            params.proposalId,
            idempotencyKeyHash,
            record,
            new Date(nowMs()).toISOString(),
            "execute disabled",
          );
          await durablePersist(persistNow);
          return {
            httpStatus: 503,
            body: {
              error: "execute disabled — operator must enable INTENTGUARD_EXECUTE on gateway",
              errorCode: "execute_disabled",
              executionState: record.state,
            },
            needsPersist: true,
          };
        }

        try {
          assertHostedExecuteAuthzConfig(config.requireOnChainGrant);
        } catch {
          failBeforeBroadcast(
            safety,
            params.proposalId,
            idempotencyKeyHash,
            record,
            new Date(nowMs()).toISOString(),
            "on-chain AuthZ verification disabled on hosted runtime",
          );
          await durablePersist(persistNow);
          return {
            httpStatus: 503,
            body: {
              error: "on-chain typed AuthZ verification is disabled in this configuration",
              errorCode: "authz_verification_disabled",
              executionState: record.state,
            },
            needsPersist: true,
          };
        }

        const gate = assertSessionExecutableForBroadcast(
          gateway,
          params.agentApiToken,
          nowMs(),
        );
        if (!gate.ok) {
          failBeforeBroadcast(
            safety,
            params.proposalId,
            idempotencyKeyHash,
            record,
            new Date(nowMs()).toISOString(),
            gate.message,
          );
          await durablePersist(persistNow);
          return {
            httpStatus: gate.code === "session_revoked" ? 410 : 403,
            body: {
              error: gate.message,
              errorCode: gate.code,
              executionState: record.state,
            },
            needsPersist: true,
          };
        }

        gateway.touchSessionBudget(session);
        const policyDecision = evaluateTradeIntent(session.policy, params.intent, {
          dailyMarginUsed: session.dailyMarginUsed,
        });
        audit.append("execute_policy_recheck", policyDecision.allow ? "allowed" : "denied", {
          sessionId: session.sessionId,
          proposalId: params.proposalId,
          allow: policyDecision.allow,
        });
        if (!policyDecision.allow) {
          failBeforeBroadcast(
            safety,
            params.proposalId,
            idempotencyKeyHash,
            record,
            new Date(nowMs()).toISOString(),
            policyDecision.reasons.join("; "),
          );
          const body = envelopeExecute({
            status: "denied",
            stage: "policy",
            reasons: policyDecision.reasons,
            signed: false,
            broadcast: false,
            sessionId: session.sessionId,
          });
          record.result = body as unknown as Record<string, unknown>;
          safety.upsertIdempotency(record);
          await durablePersist(persistNow);
          return {
            httpStatus: 200,
            body: { ...body, errorCode: "policy_denied", executionState: record.state },
            needsPersist: true,
          };
        }

        if (config.requireExecuteReadiness === true) {
          const readinessProbe =
            params.deps.executeReadinessGate ?? assertExecuteReadinessForBroadcast;
          const readiness = await readinessProbe({
            session,
            network: config.network ?? "testnet",
            marketId: params.intent.marketId,
          });
          audit.append(
            readiness.ok ? "execute_readiness_ok" : "execute_readiness_fail",
            readiness.ok ? "readiness verified" : readiness.message,
            {
              sessionId: session.sessionId,
              proposalId: params.proposalId,
              blockers: readiness.ok ? [] : readiness.blockers,
            },
          );
          if (!readiness.ok) {
            failBeforeBroadcast(
              safety,
              params.proposalId,
              idempotencyKeyHash,
              record,
              new Date(nowMs()).toISOString(),
              readiness.message,
            );
            await durablePersist(persistNow);
            return {
              httpStatus: readiness.errorCode === "execute_readiness_unavailable" ? 503 : 403,
              body: {
                error: readiness.message,
                errorCode: readiness.errorCode,
                blockers: readiness.blockers,
                executionState: record.state,
              },
              needsPersist: true,
            };
          }
        }

        if (shouldVerifyAuthzAtExecute(config.requireOnChainGrant)) {
          const grantStatus = await verifySessionGrantOnChain({
            session,
            network: config.network ?? "testnet",
          });
          audit.append(
            grantStatus.ready ? "execute_authz_ok" : "execute_authz_fail",
            grantStatus.ready ? "grants verified" : grantStatus.issues.join("; "),
            { sessionId: session.sessionId, proposalId: params.proposalId },
          );
          if (!grantStatus.ready) {
            failBeforeBroadcast(
              safety,
              params.proposalId,
              idempotencyKeyHash,
              record,
              new Date(nowMs()).toISOString(),
              "authz not ready",
            );
            const body = envelopeExecute({
              status: "denied",
              stage: "policy",
              reasons: ["on-chain typed grant missing or invalid", ...grantStatus.issues],
              signed: false,
              broadcast: false,
              sessionId: session.sessionId,
            });
            record.result = body as unknown as Record<string, unknown>;
            safety.upsertIdempotency(record);
            await durablePersist(persistNow);
            return {
              httpStatus: 200,
              body: { ...body, errorCode: "authz_not_ready", executionState: record.state },
              needsPersist: true,
            };
          }
        }

        if (sessionGuard?.shouldAbortForRevokeSignal(session.sessionId)) {
          failBeforeBroadcast(
            safety,
            params.proposalId,
            idempotencyKeyHash,
            record,
            new Date(nowMs()).toISOString(),
            "session revoked during execute",
          );
          await durablePersist(persistNow);
          return {
            httpStatus: 410,
            body: {
              error: "session revoked during execute",
              errorCode: "session_revoked",
              executionState: record.state,
            },
            needsPersist: true,
          };
        }

        if (executionMaintenanceActive(params.deps)) {
          failBeforeBroadcast(
            safety,
            params.proposalId,
            idempotencyKeyHash,
            record,
            new Date(nowMs()).toISOString(),
            EXECUTION_MAINTENANCE_MESSAGE,
          );
          audit.append("execute_maintenance_rejected", EXECUTION_MAINTENANCE_MESSAGE, {
            sessionId: session.sessionId,
            proposalId: params.proposalId,
            idempotencyKeyHash,
            phase: "pre_broadcast",
          });
          await durablePersist(persistNow);
          return {
            httpStatus: 503,
            body: {
              error: EXECUTION_MAINTENANCE_MESSAGE,
              errorCode: EXECUTION_MAINTENANCE_ERROR_CODE,
              executionState: record.state,
            },
            needsPersist: true,
          };
        }

        const preBroadcastGate = assertSessionExecutableForBroadcast(
          gateway,
          params.agentApiToken,
          nowMs(),
        );
        if (!preBroadcastGate.ok) {
          failBeforeBroadcast(
            safety,
            params.proposalId,
            idempotencyKeyHash,
            record,
            new Date(nowMs()).toISOString(),
            preBroadcastGate.message,
          );
          await durablePersist(persistNow);
          return {
            httpStatus: preBroadcastGate.code === "session_revoked" ? 410 : 403,
            body: {
              error: preBroadcastGate.message,
              errorCode: preBroadcastGate.code,
              executionState: record.state,
            },
            needsPersist: true,
          };
        }

        const pendingIso = new Date(nowMs()).toISOString();
        safety.transitionIdempotency(record, "broadcast_pending", pendingIso);
        safety.transitionProposalStatus(params.proposalId, "broadcast_pending", pendingIso);
        audit.append("execute_broadcast_pending", "Durable broadcast boundary entered", {
          sessionId: session.sessionId,
          proposalId: params.proposalId,
          idempotencyKeyHash,
        });

        const persistBeforeBroadcast = await durablePersist(persistNow);
        if (persistBeforeBroadcast) {
          safety.transitionIdempotency(record, "broadcast_unknown", new Date(nowMs()).toISOString());
          safety.finalizeProposalConsume(
            params.proposalId,
            idempotencyKeyHash,
            "broadcast_unknown",
          );
          await durablePersist(persistNow);
          return {
            ...persistBeforeBroadcast,
            body: {
              ...persistBeforeBroadcast.body,
              executionState: "broadcast_unknown",
              warning: "Persistence failed at broadcast boundary — reconcile before retry",
            },
            needsPersist: true,
          };
        }

        sessionGuard?.enterBroadcasting(session.sessionId);

        let chainResult: Awaited<ReturnType<typeof executeAgentIntent>>;
        let broadcastThrown = false;
        try {
          chainResult = await runChainExecute({
            gateway,
            agentApiToken: params.agentApiToken,
            intent: params.intent,
            ownerPrivateKeyHex: config.ownerPrivateKeyHex ?? null,
            requireOnChainGrant: false,
            network: config.network,
            preBroadcastCheck: () => {
              if (sessionGuard?.shouldAbortForRevokeSignal(session.sessionId)) {
                return {
                  ok: false as const,
                  code: "session_revoked" as const,
                  message: "session revoked during execute",
                };
              }
              return assertSessionExecutableForBroadcast(
                gateway,
                params.agentApiToken,
                nowMs(),
              );
            },
          });
        } catch (e) {
          broadcastThrown = true;
          chainResult = {
            status: "denied",
            stage: "broadcast",
            reasons: [e instanceof Error ? e.message : String(e)],
            signed: false,
            broadcast: false,
            sessionId: session.sessionId,
          };
        }

        const enveloped = {
          ...envelopeExecute(chainResult as unknown as Record<string, unknown>),
          proposalId: params.proposalId,
          idempotencyKeyHash,
          requestFingerprint,
        };

        if ("txHash" in chainResult && chainResult.txHash) {
          record.txHash = chainResult.txHash;
          safety.transitionIdempotency(record, "broadcasted", new Date(nowMs()).toISOString());
          safety.transitionProposalStatus(params.proposalId, "broadcasted", new Date(nowMs()).toISOString());
          await durablePersist(persistNow);
        }

        if (broadcastThrown) {
          safety.transitionIdempotency(record, "broadcast_unknown", new Date(nowMs()).toISOString());
          record.message = chainResult.reasons?.join("; ");
          record.result = enveloped as unknown as Record<string, unknown>;
          safety.upsertIdempotency(record);
          safety.finalizeProposalConsume(params.proposalId, idempotencyKeyHash, "broadcast_unknown");
          audit.append("execute_broadcast_unknown", "Broadcast threw — outcome unknown", {
            sessionId: session.sessionId,
            proposalId: params.proposalId,
            idempotencyKeyHash,
          });
          await durablePersist(persistNow);
          return {
            httpStatus: 503,
            body: {
              ...enveloped,
              errorCode: "broadcast_unknown",
              executionState: record.state,
              warning:
                "Do not retry with a new Idempotency-Key — reconcile chain state first. Retry with the same key only returns this record.",
            },
            needsPersist: true,
          };
        }

        if (chainResult.status === "allowed" && chainResult.broadcast && chainResult.txHash) {
          safety.transitionIdempotency(record, "confirmed", new Date(nowMs()).toISOString());
          record.state = "completed";
          record.txHash = chainResult.txHash;
          record.updatedAt = new Date(nowMs()).toISOString();
          record.result = enveloped as unknown as Record<string, unknown>;
          safety.upsertIdempotency(record);
          safety.transitionProposalStatus(params.proposalId, "confirmed", new Date(nowMs()).toISOString());
          safety.finalizeProposalConsume(params.proposalId, idempotencyKeyHash, "consumed");
          audit.append("execute_broadcast_confirmed", "Execute completed", {
            sessionId: session.sessionId,
            proposalId: params.proposalId,
            idempotencyKeyHash,
            txHash: chainResult.txHash,
          });
          await durablePersist(persistNow);
          return {
            httpStatus: 200,
            body: { ...enveloped, executionState: "confirmed" },
            needsPersist: true,
          };
        }

        const signed = "signed" in chainResult && chainResult.signed;
        const broadcast = "broadcast" in chainResult && chainResult.broadcast;
        if (signed && !broadcast) {
          safety.transitionIdempotency(record, "broadcast_unknown", new Date(nowMs()).toISOString());
          record.result = enveloped as unknown as Record<string, unknown>;
          safety.upsertIdempotency(record);
          safety.finalizeProposalConsume(params.proposalId, idempotencyKeyHash, "broadcast_unknown");
          audit.append("execute_broadcast_unknown", "Signed but not broadcast", {
            sessionId: session.sessionId,
            proposalId: params.proposalId,
          });
          await durablePersist(persistNow);
          return {
            httpStatus: 503,
            body: {
              ...enveloped,
              errorCode: "broadcast_unknown",
              executionState: record.state,
            },
            needsPersist: true,
          };
        }

        failBeforeBroadcast(
          safety,
          params.proposalId,
          idempotencyKeyHash,
          record,
          new Date(nowMs()).toISOString(),
          chainResult.reasons?.join("; ") ?? "failed before broadcast",
        );
        record.result = enveloped as unknown as Record<string, unknown>;
        safety.upsertIdempotency(record);
        audit.append("execute_failed", "Execute failed before durable broadcast", {
          sessionId: session.sessionId,
          proposalId: params.proposalId,
          idempotencyKeyHash,
        });
        await durablePersist(persistNow);
        return {
          httpStatus: 200,
          body: { ...enveloped, executionState: record.state },
          needsPersist: true,
        };
      } finally {
        if (mutationHeld && stateWrite) {
          stateWrite.endMutation();
        }
        if (sessionHoldAcquired && sessionGuard) {
          sessionGuard.release(session.sessionId);
        }
      }
    },
  );
}
