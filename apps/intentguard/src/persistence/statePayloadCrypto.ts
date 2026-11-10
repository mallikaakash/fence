import type { GatewaySession } from "../gateway/session.ts";
import type { StoredSession } from "../server/secureStore.ts";
import { decryptSecret, encryptSecret } from "../server/crypto.ts";
import { sealAuditLog, verifyAuditSeal } from "../server/auth.ts";

export function encryptGrantee(
  session: GatewaySession,
  dataKey: Buffer | null,
): StoredSession {
  const { granteePrivateKeyHex, ...rest } = session;
  if (!granteePrivateKeyHex) {
    return { ...rest, granteePrivateKeyHex: "" };
  }
  if (dataKey) {
    return {
      ...rest,
      granteePrivateKeyEnc: encryptSecret(dataKey, granteePrivateKeyHex),
    };
  }
  return { ...rest, granteePrivateKeyHex };
}

export function decryptGrantee(
  stored: StoredSession,
  dataKey: Buffer | null,
): GatewaySession {
  let hex = stored.granteePrivateKeyHex ?? "";
  if (stored.granteePrivateKeyEnc) {
    if (!dataKey) {
      throw new Error(
        "state contains encrypted grantee keys — set INTENTGUARD_DATA_KEY",
      );
    }
    hex = decryptSecret(dataKey, stored.granteePrivateKeyEnc);
  }
  return { ...stored, granteePrivateKeyHex: hex };
}

export function sealAudit(auditJson: string, dataKey: Buffer): string {
  return sealAuditLog(auditJson, dataKey);
}

export function verifyAudit(
  audit: unknown[],
  seal: string,
  dataKey: Buffer,
): boolean {
  return verifyAuditSeal(JSON.stringify(audit), seal, dataKey);
}
