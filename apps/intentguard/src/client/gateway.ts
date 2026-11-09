/**
 * Thin HTTP client for integrators (no keys except agent token or owner API key).
 */
export type GatewayClientOptions = {
  baseUrl: string;
  ownerApiKey?: string;
  agentApiToken?: string;
};

async function request(
  opts: GatewayClientOptions,
  path: string,
  init: RequestInit & { asAgent?: boolean; idempotencyKey?: string } = {},
) {
  const base = opts.baseUrl.replace(/\/$/, "");
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  const token = init.asAgent ? opts.agentApiToken : opts.ownerApiKey;
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.idempotencyKey) {
    headers.set("idempotency-key", init.idempotencyKey);
  }
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

export function createGatewayClient(opts: GatewayClientOptions) {
  return {
    health: () => request(opts, "/health", { method: "GET" }),
    agentSession: () =>
      request(opts, "/v1/agent/session", { method: "GET", asAgent: true }),
    openApi: () => request(opts, "/v1/openapi.json", { method: "GET" }),
    propose: (intent: unknown, extra?: { idempotencyKey?: string }) =>
      request(opts, "/v1/propose", {
        method: "POST",
        body: JSON.stringify({ intent }),
        asAgent: true,
        idempotencyKey: extra?.idempotencyKey,
      }),
    execute: (intent: unknown) =>
      request(opts, "/v1/execute", {
        method: "POST",
        body: JSON.stringify({ intent }),
        asAgent: true,
      }),
    grantStatus: (sessionId: string) =>
      request(opts, `/v1/sessions/${sessionId}/grant-status`, {
        method: "GET",
      }),
    createSession: (body: unknown) =>
      request(opts, "/v1/sessions", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  };
}
