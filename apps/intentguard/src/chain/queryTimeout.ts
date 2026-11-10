/** Default per-query timeout for readiness chain calls (no retries). */
export function readinessQueryTimeoutMs(): number {
  const n = Number(process.env.INTENTGUARD_READINESS_QUERY_TIMEOUT_MS ?? 12_000);
  return Number.isFinite(n) && n >= 1_000 ? Math.floor(n) : 12_000;
}

export class QueryTimeoutError extends Error {
  readonly label: string;
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "QueryTimeoutError";
    this.label = label;
  }
}

export async function withQueryTimeout<T>(
  label: string,
  ms: number,
  run: () => Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new QueryTimeoutError(label, ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs: number },
): Promise<Response> {
  const { timeoutMs, ...rest } = init;
  return fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
}
