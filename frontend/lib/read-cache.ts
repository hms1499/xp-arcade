// frontend/lib/read-cache.ts
import { retryWithBackoff, type RetryOpts } from "./retry";

type Entry<T> = { value: T; expiresAt: number };

const cache = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/** Test/reset helper — clears all cached + in-flight reads. */
export function clearReadCache(): void {
  cache.clear();
  inFlight.clear();
}

/** Memoized read: serves a fresh cached value, dedupes concurrent calls for the
 *  same key, and runs the fetch through retryWithBackoff. */
export async function cachedRead<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  retryOpts?: RetryOpts,
): Promise<T> {
  const hit = cache.get(key) as Entry<T> | undefined;
  if (hit && Date.now() < hit.expiresAt) return hit.value;

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const p = retryWithBackoff(fn, retryOpts)
    .then((value) => {
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, p);
  return p;
}
