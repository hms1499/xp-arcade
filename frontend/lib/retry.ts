// frontend/lib/retry.ts
/** True for HTTP 429 / rate-limit-class errors. Errs toward NOT retrying
 *  unknown errors. */
export function isRateLimitError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const e = err as { status?: number; statusCode?: number; message?: unknown };
    if (e.status === 429 || e.statusCode === 429) return true;
    if (typeof e.message === "string" && /429|rate.?limit|too many requests/i.test(e.message)) {
      return true;
    }
    return false;
  }
  if (typeof err === "string") return /429|rate.?limit|too many requests/i.test(err);
  return false;
}

export type RetryOpts = {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  isRetryable?: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Run `fn`, retrying rate-limit failures with exponential backoff + jitter. */
export async function retryWithBackoff<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const baseMs = opts.baseMs ?? 300;
  const maxMs = opts.maxMs ?? 4_000;
  const isRetryable = opts.isRetryable ?? isRateLimitError;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !isRetryable(err)) throw err;
      const backoff = Math.min(maxMs, baseMs * 2 ** i);
      await sleep(backoff + Math.random() * backoff * 0.25);
    }
  }
  throw lastErr;
}
