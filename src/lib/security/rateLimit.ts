type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, Bucket>;

type RateLimitOptions = {
  limit?: number;
  windowMs?: number;
  namespace?: string;
};

type AbuseProtectionOptions = {
  scope: string;
  burstLimit?: number;
  burstWindowMs?: number;
  sustainedLimit?: number;
  sustainedWindowMs?: number;
  globalLimit?: number;
  globalWindowMs?: number;
};

type AbuseProtectionResult = {
  allowed: boolean;
  status: 200 | 400 | 403 | 429;
  reason: string;
  remaining: number;
  resetAt: number;
};

declare global {
  // Reuse buckets within a warm Node.js function instance. This is one layer of
  // defense; Vercel/CDN controls remain the outer protection against DDoS.
  // eslint-disable-next-line no-var
  var __thonburiRateLimitStore: RateLimitStore | undefined;
}

const store: RateLimitStore = globalThis.__thonburiRateLimitStore ?? new Map<string, Bucket>();
globalThis.__thonburiRateLimitStore = store;

let operations = 0;

function normalizeClientAddress(value: string | null) {
  return (value || "unknown")
    .split(",")[0]
    ?.trim()
    .replace(/[^0-9a-fA-F:.\-]/g, "")
    .slice(0, 128) || "unknown";
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  return normalizeClientAddress(forwarded || realIp);
}

function pruneExpired(now: number) {
  operations += 1;
  if (store.size < 5_000 && operations % 128 !== 0) return;

  for (const [bucketKey, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(bucketKey);
  }

  // Fail safe against unbounded memory growth in a long-lived instance.
  if (store.size > 10_000) {
    const keys = store.keys();
    while (store.size > 8_000) {
      const next = keys.next();
      if (next.done) break;
      store.delete(next.value);
    }
  }
}

function consumeBucket(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  pruneExpired(now);
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt };
  }

  current.count += 1;
  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  };
}

export function checkApiRateLimit(request: Request, options: RateLimitOptions = {}) {
  const limit = options.limit ?? 120;
  const windowMs = options.windowMs ?? 60_000;
  const namespace = options.namespace ?? "api";
  return consumeBucket(`${namespace}:ip:${clientKey(request)}`, limit, windowMs);
}

export function checkApiAbuseProtection(
  request: Request,
  options: AbuseProtectionOptions
): AbuseProtectionResult {
  const now = Date.now();
  const fetchSite = (request.headers.get("sec-fetch-site") || "").toLowerCase();
  if (fetchSite === "cross-site") {
    return {
      allowed: false,
      status: 403,
      reason: "Cross-site API requests are not allowed",
      remaining: 0,
      resetAt: now,
    };
  }

  const userAgent = request.headers.get("user-agent") || "";
  if (userAgent.length > 512) {
    return {
      allowed: false,
      status: 400,
      reason: "Request headers are too large",
      remaining: 0,
      resetAt: now,
    };
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > 0) {
    return {
      allowed: false,
      status: 400,
      reason: "GET requests must not include a body",
      remaining: 0,
      resetAt: now,
    };
  }

  const burst = checkApiRateLimit(request, {
    namespace: `${options.scope}:burst`,
    limit: options.burstLimit ?? 20,
    windowMs: options.burstWindowMs ?? 10_000,
  });
  if (!burst.allowed) {
    return { ...burst, allowed: false, status: 429, reason: "Too many requests" };
  }

  const sustained = checkApiRateLimit(request, {
    namespace: `${options.scope}:sustained`,
    limit: options.sustainedLimit ?? 90,
    windowMs: options.sustainedWindowMs ?? 60_000,
  });
  if (!sustained.allowed) {
    return { ...sustained, allowed: false, status: 429, reason: "Too many requests" };
  }

  const global = consumeBucket(
    `${options.scope}:global`,
    options.globalLimit ?? 1_500,
    options.globalWindowMs ?? 60_000
  );
  if (!global.allowed) {
    return { ...global, allowed: false, status: 429, reason: "Service is busy" };
  }

  return {
    allowed: true,
    status: 200,
    reason: "ok",
    remaining: Math.min(burst.remaining, sustained.remaining),
    resetAt: Math.max(burst.resetAt, sustained.resetAt),
  };
}
