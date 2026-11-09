import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "igv1:";

/** 32-byte key from 64 hex chars or 44-char base64. */
export function parseDataKey(raw: string | undefined): Buffer | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(t)) return Buffer.from(t, "hex");
  const b = Buffer.from(t, "base64");
  if (b.length === 32) return b;
  throw new Error("INTENTGUARD_DATA_KEY must be 32 bytes (64 hex or 44 base64)");
}

export function encryptSecret(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    Buffer.concat([iv, tag, enc]).toString("base64url")
  );
}

export function decryptSecret(key: Buffer, sealed: string): string {
  if (!sealed.startsWith(PREFIX)) {
    throw new Error("unknown ciphertext format");
  }
  const buf = Buffer.from(sealed.slice(PREFIX.length), "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
