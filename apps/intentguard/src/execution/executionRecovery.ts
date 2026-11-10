import type { AuditLog } from "../gateway/audit.ts";
import type { ExecutionSafetyStore } from "./executionSafetyStore.ts";
import type { ExecuteIdempotencyRecord, TradeProposal } from "./types.ts";

const PRE_BROADCAST_IDEM: ExecuteIdempotencyRecord["state"][] = ["processing"];
const MAY_HAVE_BROADCAST: ExecuteIdempotencyRecord["state"][] = [
  "broadcast_pending",
  "broadcasted",
  "broadcast_unknown",
  "confirmed",
  "completed",
];

/**
 * Startup recovery for a single gateway instance loading state.json.
 * Never auto-rebroadcasts ambiguous states.
 */
export function recoverExecutionSafetyOnStartup(
  safety: ExecutionSafetyStore,
  audit: AuditLog,
  nowMs: number = Date.now(),
): void {
  const { proposals, executeIdempotency } = safety.exportState();
  const nowIso = new Date(nowMs).toISOString();

  for (const record of executeIdempotency) {
    if (record.state === "broadcast_pending" || record.state === "broadcasted") {
      const prev = record.state;
      record.state = "broadcast_unknown";
      record.updatedAt = nowIso;
      record.executionMeta = {
        lastTransitionAt: nowIso,
        recoveryAt: nowIso,
        recoveryReason: "startup_ambiguous_broadcast",
        previousState: prev,
      };
      safety.upsertIdempotency(record);
      audit.append("execute_recovery", "Idempotency broadcast_pending → broadcast_unknown", {
        proposalId: record.proposalId,
        idempotencyKeyHash: record.idempotencyKeyHash,
        previousState: prev,
      });
    }
  }

  for (const proposal of proposals) {
    const linked = executeIdempotency.filter((r) => r.proposalId === proposal.proposalId);

    if (proposal.status === "broadcast_pending" || proposal.status === "broadcasted") {
      const prev = proposal.status;
      proposal.status = "broadcast_unknown";
      proposal.executionMeta = {
        lastTransitionAt: nowIso,
        recoveryAt: nowIso,
        recoveryReason: "startup_ambiguous_broadcast",
        previousState: prev,
      };
      safety.replaceProposal(proposal);
      audit.append("execute_recovery", "Proposal broadcast_pending → broadcast_unknown", {
        proposalId: proposal.proposalId,
        previousState: prev,
      });
      continue;
    }

    if (proposal.status === "broadcast_unknown") {
      continue;
    }

    if (proposal.status === "consuming") {
      const idem = linked[0];
      if (!idem || PRE_BROADCAST_IDEM.includes(idem.state)) {
        const prevP = proposal.status;
        proposal.status = "approved";
        proposal.activeIdempotencyKeyHash = undefined;
        proposal.executionMeta = {
          lastTransitionAt: nowIso,
          recoveryAt: nowIso,
          recoveryReason: "startup_consuming_pre_broadcast",
          previousState: prevP,
        };
        safety.replaceProposal(proposal);
        if (idem) {
          const prevI = idem.state;
          idem.state = "failed_before_broadcast";
          idem.message = "Recovered after crash before broadcast boundary";
          idem.updatedAt = nowIso;
          idem.executionMeta = {
            lastTransitionAt: nowIso,
            recoveryAt: nowIso,
            recoveryReason: "startup_consuming_pre_broadcast",
            previousState: prevI,
          };
          safety.upsertIdempotency(idem);
        }
        audit.append("execute_recovery", "Proposal consuming → approved (pre-broadcast)", {
          proposalId: proposal.proposalId,
        });
        continue;
      }
      if (MAY_HAVE_BROADCAST.includes(idem.state)) {
        const prevP = proposal.status;
        proposal.status = "broadcast_unknown";
        proposal.executionMeta = {
          lastTransitionAt: nowIso,
          recoveryAt: nowIso,
          recoveryReason: "startup_consuming_may_have_broadcast",
          previousState: prevP,
        };
        safety.replaceProposal(proposal);
        if (idem.state !== "broadcast_unknown") {
          const prevI = idem.state;
          idem.state = "broadcast_unknown";
          idem.updatedAt = nowIso;
          idem.executionMeta = {
            lastTransitionAt: nowIso,
            recoveryAt: nowIso,
            recoveryReason: "startup_consuming_may_have_broadcast",
            previousState: prevI,
          };
          safety.upsertIdempotency(idem);
        }
        audit.append("execute_recovery", "Proposal consuming → broadcast_unknown", {
          proposalId: proposal.proposalId,
        });
      }
    }
  }
}
