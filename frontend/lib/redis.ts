import { Redis } from "@upstash/redis";

export type MinimalRedis = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  mget<T = string>(...keys: string[]): Promise<(T | null)[]>;
};

let override: MinimalRedis | null | undefined;
let cached: MinimalRedis | null | undefined;

/** Test hook: force a specific client (or null for the no-op path). */
export function _setRedisForTests(client: MinimalRedis | null): void {
  override = client;
  cached = undefined;
}

function client(): MinimalRedis | null {
  if (override !== undefined) return override;
  if (cached !== undefined) return cached;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? (new Redis({ url, token }) as unknown as MinimalRedis) : null;
  return cached;
}

export async function incrWithTtl(key: string, ttlSeconds?: number): Promise<void> {
  const redis = client();
  if (!redis) return;
  try {
    await redis.incr(key);
    if (ttlSeconds) await redis.expire(key, ttlSeconds);
  } catch {
    // Telemetry must never break the app.
  }
}

export async function mget(keys: string[]): Promise<(number | null)[]> {
  const redis = client();
  if (!redis || keys.length === 0) return keys.map(() => null);
  try {
    const raw = await redis.mget<string | number>(...keys);
    return raw.map((v) => (v == null ? null : Number(v)));
  } catch {
    return keys.map(() => null);
  }
}
