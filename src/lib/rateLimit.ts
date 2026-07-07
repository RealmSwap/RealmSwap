// Simple in-memory rate limiter using a Sliding Window approach
interface RateLimitInfo {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitInfo>();

export interface RateLimitOptions {
  limit: number;    // Maximum requests per window
  windowMs: number; // Window duration in milliseconds
}

/**
 * Checks and updates the rate limit for a given key (e.g., IP address).
 * @param key The unique identifier for the client (e.g., IP).
 * @param options Rate limit options.
 * @returns true if the request is allowed, false if rate limited.
 */
export function checkRateLimit(key: string, options: RateLimitOptions): boolean {
  const now = Date.now();
  const info = store.get(key);

  if (!info) {
    store.set(key, { count: 1, resetTime: now + options.windowMs });
    return true;
  }

  // If the window has expired, reset it
  if (now > info.resetTime) {
    info.count = 1;
    info.resetTime = now + options.windowMs;
    return true;
  }

  // Increment and check if within limit
  info.count += 1;
  if (info.count > options.limit) {
    return false;
  }

  return true;
}

// Cleanup expired entries periodically to prevent memory leaks in long-running processes
setInterval(() => {
  const now = Date.now();
  store.forEach((info, key) => {
    if (now > info.resetTime) {
      store.delete(key);
    }
  });
}, 60000).unref(); // .unref() ensures this interval doesn't prevent Node from exiting
