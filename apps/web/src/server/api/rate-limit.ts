/** Fixed-window in-memory rate limiter. Swap for a shared store when running several instances. */
export interface RateLimiter {
  hit(key: string): { allowed: boolean; limit: number; remaining: number; resetSeconds: number };
}

export function memoryRateLimiter(limit: number, windowMs: number): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key) {
      const now = Date.now();
      let b = buckets.get(key);
      if (!b || b.resetAt <= now) {
        b = { count: 0, resetAt: now + windowMs };
        buckets.set(key, b);
        if (buckets.size > 10_000) {
          for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
        }
      }
      b.count++;
      return {
        allowed: b.count <= limit,
        limit,
        remaining: Math.max(0, limit - b.count),
        resetSeconds: Math.ceil((b.resetAt - now) / 1000),
      };
    },
  };
}
