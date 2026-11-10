export function proposalTtlMs(): number {
  const n = Number(process.env.INTENTGUARD_PROPOSAL_TTL_MS ?? 300_000);
  return Number.isFinite(n) && n >= 5_000 ? Math.floor(n) : 300_000;
}

export function validateIdempotencyKey(raw: string | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const key = raw.trim();
  if (key.length < 1 || key.length > 128) return null;
  if (!/^[\x21-\x7e]+$/.test(key)) return null;
  return key;
}
