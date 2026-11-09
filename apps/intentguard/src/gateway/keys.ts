/**
 * Key roles for the non-bypass model.
 *
 * - owner: human granter (never in agent process)
 * - grantee: AuthZ session key; ONLY the IntentGuard gateway may hold this
 * - agent: may submit intents + read decisions; must NOT hold grantee material
 */

export type KeyRole = "owner" | "grantee" | "agent";

export type AgentCredential = {
  role: "agent";
  /** Opaque API token / session id — not a blockchain private key. */
  apiToken: string;
};

export type GranteeSecret = {
  role: "grantee";
  /** Hex private key — gateway memory / HSM / TEE only. */
  privateKeyHex: string;
};

/** Runtime assertion: agent credentials never look like secp256k1 keys. */
export function assertAgentHasNoSigningKey(
  credential: AgentCredential,
): void {
  if (credential.role !== "agent") {
    throw new Error("expected agent credential");
  }
  const token = credential.apiToken.trim();
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(token)) {
    throw new Error(
      "agent credential must not be a raw private key (non-bypass violation)",
    );
  }
}

export function isGranteeMaterialExposedToAgent(
  agentEnv: Record<string, string | undefined>,
): boolean {
  const suspects = [
    agentEnv.INTENTGUARD_GRANTEE_PRIVATE_KEY,
    agentEnv.INJECTIVE_GRANTEE_PRIVATE_KEY,
    agentEnv.GRANTEE_PRIVATE_KEY,
  ];
  return suspects.some(
    (v) => typeof v === "string" && /^(0x)?[0-9a-fA-F]{64}$/.test(v.trim()),
  );
}
