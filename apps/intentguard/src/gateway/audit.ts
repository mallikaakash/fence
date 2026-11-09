export type AuditEvent = {
  id: string;
  at: string;
  type:
    | "session_created"
    | "propose_allowed"
    | "propose_denied"
    | "revoke"
    | "key_isolation_ok"
    | "key_isolation_fail"
    | "execute_allowed"
    | "execute_denied";
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
