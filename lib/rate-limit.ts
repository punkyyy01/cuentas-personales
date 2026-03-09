type Entry = { count: number; windowStart: number };

const store = new Map<string, Entry>();

/**
 * Simple in-memory rate limiter.
 * Returns true if the request is allowed, false if it exceeds the limit.
 * Note: resets per serverless instance — effective against burst abuse within
 * the same instance, not across distributed deployments.
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= maxRequests) return false;

  entry.count++;
  return true;
}
