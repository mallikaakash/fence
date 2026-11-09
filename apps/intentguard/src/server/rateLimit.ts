export type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

export class RateLimiter {
  readonly #cfg: RateLimitConfig;
  readonly #hits = new Map<string, { count: number; windowStart: number }>();

  constructor(cfg: RateLimitConfig) {
    this.#cfg = cfg;
  }

  /** @returns null if allowed, or retry-after seconds if blocked */
  check(key: string, now = Date.now()): number | null {
    const cur = this.#hits.get(key);
    if (!cur || now - cur.windowStart >= this.#cfg.windowMs) {
      this.#hits.set(key, { count: 1, windowStart: now });
      return null;
    }
    if (cur.count >= this.#cfg.maxRequests) {
      const retrySec = Math.ceil(
        (this.#cfg.windowMs - (now - cur.windowStart)) / 1000,
      );
      return Math.max(1, retrySec);
    }
    cur.count += 1;
    return null;
  }
}
