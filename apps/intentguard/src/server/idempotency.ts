const cache = new Map<string, { at: number; body: unknown }>();
const TTL_MS = 60 * 60 * 1000;

function key(sessionId: string, idempotencyKey: string) {
  return `${sessionId}:${idempotencyKey}`;
}

export function idempotencyGet(
  sessionId: string,
  idempotencyKey: string,
): unknown | null {
  const entry = cache.get(key(sessionId, idempotencyKey));
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    cache.delete(key(sessionId, idempotencyKey));
    return null;
  }
  return entry.body;
}

export function idempotencySet(
  sessionId: string,
  idempotencyKey: string,
  body: unknown,
): void {
  cache.set(key(sessionId, idempotencyKey), { at: Date.now(), body });
}

/** Test helper */
export function idempotencyClear(): void {
  cache.clear();
}
