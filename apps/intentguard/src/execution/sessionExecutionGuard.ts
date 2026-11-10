/**
 * Single-process session-level execute coordination (revoke vs in-flight execute).
 * Does not provide distributed safety across replicas.
 */

export type SessionExecutePhase = "claimed" | "broadcasting";

export type SessionExecuteHold = {
  proposalId: string;
  idempotencyKeyHash: string;
  phase: SessionExecutePhase;
  /** Owner revoke arrived while execute hold was active (pre-broadcast). */
  revokeSignaled?: boolean;
};

export class SessionExecutionGuard {
  private readonly holds = new Map<string, SessionExecuteHold>();

  tryAcquire(
    sessionId: string,
    proposalId: string,
    idempotencyKeyHash: string,
  ): { ok: true } | { ok: false; phase: SessionExecutePhase; proposalId: string } {
    const existing = this.holds.get(sessionId);
    if (existing) {
      return {
        ok: false,
        phase: existing.phase,
        proposalId: existing.proposalId,
      };
    }
    this.holds.set(sessionId, {
      proposalId,
      idempotencyKeyHash,
      phase: "claimed",
    });
    return { ok: true };
  }

  enterBroadcasting(sessionId: string): void {
    const hold = this.holds.get(sessionId);
    if (hold) hold.phase = "broadcasting";
  }

  release(sessionId: string): void {
    this.holds.delete(sessionId);
  }

  getHold(sessionId: string): SessionExecuteHold | undefined {
    return this.holds.get(sessionId);
  }

  isBroadcasting(sessionId: string): boolean {
    return this.holds.get(sessionId)?.phase === "broadcasting";
  }

  /**
   * Called from POST /v1/sessions/:id/revoke before clearing session keys.
   * Returns the in-flight phase when execute holds this session.
   */
  signalRevokeDuringExecute(
    sessionId: string,
  ): "none" | SessionExecutePhase {
    const hold = this.holds.get(sessionId);
    if (!hold) return "none";
    if (hold.phase === "claimed") hold.revokeSignaled = true;
    return hold.phase;
  }

  shouldAbortForRevokeSignal(sessionId: string): boolean {
    return this.holds.get(sessionId)?.revokeSignaled === true;
  }
}
