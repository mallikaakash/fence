const KEY_URL = "intentguard.gateway.url";
const KEY_OWNER = "intentguard.gateway.ownerKey";
const KEY_AGENT = "intentguard.gateway.agentToken";

export type GatewaySettings = {
  baseUrl: string;
  ownerApiKey: string;
  agentApiToken: string;
};

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
}
