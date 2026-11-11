const KEY_URL = "intentguard.gateway.url";
const KEY_OWNER = "intentguard.gateway.ownerKey";
const KEY_AGENT = "intentguard.gateway.agentToken";
const KEY_SAVED_AT = "intentguard.gateway.savedAt";

/** Prompt to clear keys after this age (UX only — not enforced server-side). */
export const GATEWAY_SECRETS_STALE_MS = 24 * 60 * 60 * 1000;

export type GatewaySettings = {
  baseUrl: string;
  ownerApiKey: string;
  agentApiToken: string;
};

/** Owner-scoped routes work with an explicit own_ key or hosted /api/gateway proxy injection. */
export function gatewayOwnerRoutesAvailable(settings: GatewaySettings): boolean {
  if (settings.ownerApiKey?.startsWith("own_")) return true;
  return settings.baseUrl.includes("/api/gateway");
}

export function loadGatewaySettings(): GatewaySettings {
  if (typeof window === "undefined") {
    return { baseUrl: "", ownerApiKey: "", agentApiToken: "" };
  }
  return {
    baseUrl: localStorage.getItem(KEY_URL) ?? "http://127.0.0.1:8787",
    ownerApiKey: localStorage.getItem(KEY_OWNER) ?? "",
    agentApiToken: localStorage.getItem(KEY_AGENT) ?? "",
  };
}

export function saveGatewaySettings(s: Partial<GatewaySettings>) {
  if (typeof window === "undefined") return;
  if (s.baseUrl !== undefined) localStorage.setItem(KEY_URL, s.baseUrl);
  if (s.ownerApiKey !== undefined) localStorage.setItem(KEY_OWNER, s.ownerApiKey);
  if (s.agentApiToken !== undefined) {
    localStorage.setItem(KEY_AGENT, s.agentApiToken);
  }
  if (
    s.ownerApiKey !== undefined ||
    s.agentApiToken !== undefined ||
    s.baseUrl !== undefined
  ) {
    localStorage.setItem(KEY_SAVED_AT, new Date().toISOString());
  }
}

export function clearGatewaySettings(): void {
  if (typeof window === "undefined") return;
  for (const k of [KEY_URL, KEY_OWNER, KEY_AGENT, KEY_SAVED_AT]) {
    localStorage.removeItem(k);
  }
}

export function gatewaySecretsSavedAt(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_SAVED_AT);
}

export function gatewaySecretsStale(): boolean {
  const at = gatewaySecretsSavedAt();
  if (!at) return false;
  const age = Date.now() - new Date(at).getTime();
  return age > GATEWAY_SECRETS_STALE_MS;
}

export function hasStoredGatewaySecrets(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    localStorage.getItem(KEY_OWNER) || localStorage.getItem(KEY_AGENT),
  );
}
