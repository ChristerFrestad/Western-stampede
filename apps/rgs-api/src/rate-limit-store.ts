/**
 * Multi-node rate limit store: memory (default) or Redis when REDIS_URL is set.
 * Uses dynamic import of `ioredis` so local/dev without redis still works.
 */

export interface RateLimitStore {
  /** Increment key, return new count. TTL set on first hit in window. */
  incr(key: string, windowMs: number): Promise<number>;
  backend: 'memory' | 'redis';
  /** Optional cleanup (Redis disconnect). */
  close?(): Promise<void>;
}

class MemoryRateLimitStore implements RateLimitStore {
  readonly backend = 'memory' as const;
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async incr(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, b);
    }
    b.count++;
    return b.count;
  }
}

class RedisRateLimitStore implements RateLimitStore {
  readonly backend = 'redis' as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly redis: any) {}

  async incr(key: string, windowMs: number): Promise<number> {
    const rkey = `ws:rl:${key}`;
    const n = await this.redis.incr(rkey);
    if (n === 1) {
      await this.redis.pexpire(rkey, windowMs);
    }
    return n;
  }

  async close(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      try {
        this.redis.disconnect();
      } catch {
        /* ignore */
      }
    }
  }
}

let store: RateLimitStore = new MemoryRateLimitStore();
let initPromise: Promise<void> | null = null;

export function getRateLimitStore(): RateLimitStore {
  return store;
}

/**
 * Force re-init (tests). Closes previous Redis connection if any.
 */
export async function resetRateLimitStoreForTests(): Promise<void> {
  if (store.close) {
    await store.close().catch(() => undefined);
  }
  store = new MemoryRateLimitStore();
  initPromise = null;
}

export async function initRateLimitStore(
  opts: { force?: boolean } = {},
): Promise<RateLimitStore> {
  if (opts.force) {
    await resetRateLimitStoreForTests();
  }
  if (initPromise) {
    await initPromise;
    return store;
  }
  initPromise = (async () => {
    const url = process.env.REDIS_URL ?? '';
    if (!url) {
      store = new MemoryRateLimitStore();
      return;
    }
    try {
      const mod = await import('ioredis');
      // ioredis ESM/CJS interop — constructor is not always typed on default
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const RedisCtor = (mod as any).default ?? (mod as any);
      const redis = new RedisCtor(url, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        lazyConnect: true,
        connectTimeout: 3_000,
      });
      await redis.connect();
      await redis.ping();
      store = new RedisRateLimitStore(redis);
      console.log('[rgs] rate-limit store: redis');
    } catch (e) {
      console.warn(
        '[rgs] REDIS_URL set but ioredis unavailable/unreachable — using memory',
        e instanceof Error ? e.message : e,
      );
      store = new MemoryRateLimitStore();
    }
  })();
  await initPromise;
  return store;
}

export async function rateLimitIncr(
  key: string,
  windowMs: number,
): Promise<number> {
  return getRateLimitStore().incr(key, windowMs);
}
