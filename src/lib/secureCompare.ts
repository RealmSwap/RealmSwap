import * as crypto from "crypto";

/**
 * Constant-time comparison for secret-bearing request headers. Both sides
 * are SHA-256 digested first so secret length never leaks and
 * timingSafeEqual always receives equal-length buffers.
 *
 * Returns false when the expected secret is unset/empty — env-secret auth
 * must fail closed. (A plain `header !== \`Bearer ${env}\`` comparison
 * authenticates the literal "Bearer undefined" when the env var is missing.)
 */
export function secureSecretEquals(expected: string | undefined, actual: string | null | undefined): boolean {
  if (!expected || !actual) return false;
  const a = crypto.createHash("sha256").update(expected).digest();
  const b = crypto.createHash("sha256").update(actual).digest();
  return crypto.timingSafeEqual(a, b);
}
