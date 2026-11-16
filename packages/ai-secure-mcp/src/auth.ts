import { createHash, timingSafeEqual } from 'node:crypto'
import { SecureMcpError } from './types'
import type { ClientRecord } from './types'

/**
 * Hashes a raw bearer token into the lowercase hex SHA-256 stored in a
 * {@link ClientRecord}. Use it to fill a clients file and to compare a
 * presented token.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Compares two hex strings in constant time. Returns false for a length
 * mismatch. Use it so a timing side channel cannot reveal the token.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/** Reads the bearer token from an `Authorization` header value. */
export function bearerToken(header: string | null): string | undefined {
  if (header === null) return undefined
  const match = /^Bearer (.+)$/.exec(header.trim())
  return match?.[1]
}

/**
 * Finds the client that owns a raw token, in constant time per record. Throws
 * `auth_failure` when no record matches or the token is expired.
 *
 * @param token - The raw bearer token from the request
 * @param clients - The known clients, each with a token hash
 * @param nowSeconds - The current time in Unix seconds, for expiry
 */
export function verifyToken(
  token: string,
  clients: ReadonlyArray<ClientRecord>,
  nowSeconds: number,
): ClientRecord {
  const presented = hashToken(token)
  let found: ClientRecord | undefined
  // Check every record so the time does not depend on the match position.
  for (const client of clients) {
    if (constantTimeEqual(presented, client.tokenHash)) {
      found = client
    }
  }
  if (found === undefined) {
    throw new SecureMcpError('auth_failure', 'The token is not valid.')
  }
  if (found.expiresAt !== undefined && nowSeconds >= found.expiresAt) {
    throw new SecureMcpError('auth_failure', 'The token is expired.')
  }
  return found
}
