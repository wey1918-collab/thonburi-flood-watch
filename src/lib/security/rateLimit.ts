type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, Bucket>;

declare global {
  // Reuse the map within a warm Node.js function instance.
  // This is a defense-in-depth control; the CDN cache remains the primary load shield.
  // eslint-disable-next-line no-var
  var __thonburiRateLimitStore: RateLimitStore | undefined;
}

const store: RateLimitStore = globalThis.__thonburiRateLimitStore ?? new Map<string, Bucket>();
globalThis.__thonburiRateLimitStore = store;

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwarded || realIp || "unknown";
}

export function checkApiRateLimit(
  request: Request,
  options: { limit?: number; windowMs?: number } = {}
) {
  const limit = options.limit ?? 120;
  const windowMs = options.windowMs ?? 60_000;
  const now = Date.now();
  const key = clientKey(request);
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  current.count += 1;
  if (store.size > 5_000) {
    for (const [bucketKey, bucket] of store) {
      if (bucket.resetAt <= now) store.delete(bucketKey);
    }
  }

  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  };
}
