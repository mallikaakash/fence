import type { GatewaySession } from "../gateway/session.ts";
import type { AuditEvent } from "../gateway/audit.ts";
import type { ExecuteIdempotencyRecord, TradeProposal } from "../execution/types.ts";
import type { StoredSession } from "../server/secureStore.ts";
import {
  decryptGrantee,
  encryptGrantee,
  sealAudit,
  verifyAudit,
} from "./statePayloadCrypto.ts";

/** Persistence metadata — authoritative for cross-process fencing (with GCS generation). */
export type StateWriterMeta = {
  writerEpoch: number;
  writerHolderId: string;
  lastCommitId: string;
};

export type PersistedStateV3 = {
  version: 3;
  updatedAt: string;
  writerEpoch: number;
  writerHolderId: string;
  lastCommitId: string;
  sessions: StoredSession[];
  audit: AuditEvent[];
  proposals?: TradeProposal[];
  executeIdempotency?: ExecuteIdempotencyRecord[];
  auditSeal?: string;
};

export type LoadedState = {
  sessions: GatewaySession[];
  audit: AuditEvent[];
  proposals: TradeProposal[];
  executeIdempotency: ExecuteIdempotencyRecord[];
  writerMeta: StateWriterMeta;
};

export function buildStateDocument(
  sessions: GatewaySession[],
  audit: AuditEvent[],
  execution: {
    proposals: TradeProposal[];
    executeIdempotency: ExecuteIdempotencyRecord[];
  },
  dataKey: Buffer | null,
  writerMeta: StateWriterMeta,
): PersistedStateV3 {
  const stored = sessions.map((s) => encryptGrantee(s, dataKey));
  const auditJson = JSON.stringify(audit);
  return {
    version: 3,
    updatedAt: new Date().toISOString(),
    writerEpoch: writerMeta.writerEpoch,
    writerHolderId: writerMeta.writerHolderId,
    lastCommitId: writerMeta.lastCommitId,
    sessions: stored,
    audit,
    proposals: execution.proposals,
    executeIdempotency: execution.executeIdempotency,
    auditSeal: dataKey ? sealAudit(auditJson, dataKey) : undefined,
  };
}

export function parseStateDocument(
  raw: unknown,
  dataKey: Buffer | null,
): LoadedState {
  if (!raw || typeof raw !== "object") {
    throw new Error("state object malformed — expected JSON object");
  }
  const doc = raw as Record<string, unknown>;
  const version = doc.version;
  if (version !== 3 && version !== 2 && version !== 1) {
    throw new Error(`unsupported state version: ${String(version)}`);
  }

  const sessions = ((doc.sessions as StoredSession[]) ?? []).map((s) =>
    decryptGrantee(s, dataKey),
  );
  const audit = (doc.audit as AuditEvent[]) ?? [];
  const proposals =
    "proposals" in doc && Array.isArray(doc.proposals)
      ? (doc.proposals as TradeProposal[])
      : [];
  const executeIdempotency =
    "executeIdempotency" in doc && Array.isArray(doc.executeIdempotency)
      ? (doc.executeIdempotency as ExecuteIdempotencyRecord[])
      : [];

  if (dataKey && typeof doc.auditSeal === "string") {
    if (!verifyAudit(audit, doc.auditSeal, dataKey)) {
      throw new Error("audit log seal mismatch — possible tampering");
    }
  }

  const writerEpoch =
    typeof doc.writerEpoch === "number" ? doc.writerEpoch : 0;
  const writerHolderId =
    typeof doc.writerHolderId === "string" ? doc.writerHolderId : "";
  const lastCommitId =
    typeof doc.lastCommitId === "string" ? doc.lastCommitId : "";

  return {
    sessions,
    audit,
    proposals,
    executeIdempotency,
    writerMeta: { writerEpoch, writerHolderId, lastCommitId },
  };
}
