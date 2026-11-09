import { timingSafeEqual, createHmac } from "node:crypto";

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

export function sealAuditLog(eventsJson: string, key: Buffer): string {
  return createHmac("sha256", key).update(eventsJson, "utf8").digest("hex");
}

export function verifyAuditSeal(
  eventsJson: string,
  seal: string,
  key: Buffer,
): boolean {
  const expected = sealAuditLog(eventsJson, key);
  return safeEqual(expected, seal);
}
