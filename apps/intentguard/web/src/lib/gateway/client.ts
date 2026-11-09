import type { GatewaySettings } from "./storage";

async function gwFetch(
  settings: GatewaySettings,
  path: string,
  init: RequestInit & { useAgent?: boolean } = {},
) {
  const base = settings.baseUrl.replace(/\/$/, "");
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  const token = init.useAgent
    ? settings.agentApiToken
    : settings.ownerApiKey;
  if (token) headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

export async function gatewayHealth(settings: GatewaySettings) {
  return gwFetch(settings, "/health", { method: "GET" });
}

export async function gatewayListSessions(settings: GatewaySettings) {
  return gwFetch(settings, "/v1/sessions", { method: "GET" });
}

export async function gatewayCreateSession(
  settings: GatewaySettings,
  body: unknown,
) {
  return gwFetch(settings, "/v1/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function gatewayGrantTxPlan(
  settings: GatewaySettings,
  sessionId: string,
) {
  return gwFetch(settings, `/v1/sessions/${sessionId}/grant-tx-plan`, {
    method: "GET",
  });
}

export async function gatewayGrantStatus(
  settings: GatewaySettings,
  sessionId: string,
) {
  return gwFetch(settings, `/v1/sessions/${sessionId}/grant-status`, {
    method: "GET",
  });
}

export async function gatewayRevokeSession(
  settings: GatewaySettings,
  sessionId: string,
) {
  return gwFetch(settings, `/v1/sessions/${sessionId}/revoke`, {
    method: "POST",
  });
}

export async function gatewayAuditEvents(settings: GatewaySettings) {
  return gwFetch(settings, "/v1/audit/events", { method: "GET" });
}

export async function gatewayPropose(
  settings: GatewaySettings,
  intent: unknown,
) {
  return gwFetch(settings, "/v1/propose", {
    method: "POST",
    body: JSON.stringify({ intent }),
    useAgent: true,
  });
}
