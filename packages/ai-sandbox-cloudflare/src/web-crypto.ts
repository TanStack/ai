/**
 * Web Crypto helpers for the Workers runtime, where `node:crypto` is
 * unavailable. The sandbox layer's `timingSafeBearerEqual` is node-based; this
 * is the equivalent for a Worker / Durable Object.
 */

/**
 * Constant-time check of an `Authorization: Bearer <token>` header against the
 * expected token. A length mismatch returns false early (token length is not
 * secret); the equal-length comparison is timing-safe.
 */
export function timingSafeBearerEqualWeb(
  header: string | undefined,
  token: string,
): boolean {
  if (header === undefined) return false
  const a = new TextEncoder().encode(header)
  const b = new TextEncoder().encode(`Bearer ${token}`)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i]
    const bi = b[i]
    // In-bounds by construction (i < a.length === b.length); the guard satisfies
    // `noUncheckedIndexedAccess` without a non-null assertion and treats any
    // impossible out-of-bounds read as "not equal".
    if (ai === undefined || bi === undefined) return false
    diff |= ai ^ bi
  }
  return diff === 0
}
