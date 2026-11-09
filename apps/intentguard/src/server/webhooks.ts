import type { AuditEvent } from "../gateway/audit.ts";
import { logJson } from "./log.ts";

export type WebhookEnvelope = {
  at: string;
  event: AuditEvent["type"];
  message: string;
  detail?: Record<string, unknown>;
};

export function maybeDispatchWebhook(event: AuditEvent): void {
  const url = process.env.INTENTGUARD_WEBHOOK_URL?.trim();
  if (!url) return;

  const agentTypes = new Set<AuditEvent["type"]>([
    "propose_allowed",
    "propose_denied",
    "execute_allowed",
    "execute_denied",
  ]);
  if (!agentTypes.has(event.type)) return;

  const payload: WebhookEnvelope = {
    at: event.at,
    event: event.type,
    message: event.message,
    detail: event.detail,
  };

  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8_000),
  }).catch((err) => {
    logJson("warn", "webhook_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
