export type AuditEvent = {
  id: string;
  at: string;
  type:
    | "session_created"
    | "propose_allowed"
    | "propose_denied"
    | "proposal_created"
    | "proposal_expired"
    | "proposal_consumed"
    | "revoke"
    | "key_isolation_ok"
    | "key_isolation_fail"
    | "execute_allowed"
    | "execute_denied"
    | "execute_request_received"
    | "execute_maintenance_rejected"
    | "execute_claimed"
    | "execute_policy_recheck"
    | "execute_policy_fingerprint_stale"
    | "execute_authz_ok"
    | "execute_authz_fail"
    | "execute_broadcast_pending"
    | "execute_broadcast_started"
    | "execute_recovery"
    | "revoke_during_execute"
    | "revoke_during_broadcast"
    | "execute_broadcast_confirmed"
    | "execute_broadcast_unknown"
    | "execute_failed"
    | "idempotency_replay"
    | "idempotency_conflict"
    | "owner_key_rotated"
    | "state_write_frozen"
    | "state_write_unfrozen"
    | "state_write_frozen_rejected";
  message: string;
  detail?: Record<string, unknown>;
};

export class AuditLog {
  private events: AuditEvent[] = [];

  append(
    type: AuditEvent["type"],
    message: string,
    detail?: Record<string, unknown>,
  ): AuditEvent {
    const event: AuditEvent = {
      id: `evt_${this.events.length + 1}`,
      at: new Date().toISOString(),
      type,
      message,
      detail,
    };
    this.events.push(event);
    return event;
  }

  list(): AuditEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }

  /** Sidecar boot: restore persisted audit trail. */
  replaceAll(events: AuditEvent[]): void {
    this.events = [...events];
  }
}
