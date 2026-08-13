/**
 * Helpers for keeping key material out of logs and error responses.
 *
 * The server piece is a stateless pass-through: it must never write a key to a
 * DB, cache, log, or observability stream, and must never echo a full key back
 * to a client. These utilities make the last-4 the only representation that
 * ever leaves the process.
 */

/**
 * Raw trailing 4 characters. Not display-safe: a key of length ≤ 4 is returned
 * in full. Use {@link maskKey} in UI and logs.
 */
export function lastFour(key: string): string {
  return key.slice(-4)
}

/** Masks a key to `"…last4"`, or `"…"` when the key is 4 characters or shorter. */
export function maskKey(key: string): string {
  if (key.length <= 4) return '…'
  return `…${lastFour(key)}`
}

/**
 * Replaces every occurrence of each secret in `input` with its masked form.
 * Use before logging or returning any string that may have interpolated a key
 * (URLs, provider SDK error messages, stack traces).
 */
export function scrubSecrets(input: string, secrets: Array<string>): string {
  let output = input
  for (const secret of secrets) {
    if (!secret) continue
    output = output.split(secret).join(maskKey(secret))
  }
  return output
}
