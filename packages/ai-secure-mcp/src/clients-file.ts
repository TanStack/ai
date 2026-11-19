import { readFile } from 'node:fs/promises'
import { SecureMcpError } from './types'
import type { ClientRecord } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toClient(value: unknown, index: number): ClientRecord {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.tokenHash !== 'string' ||
    !Array.isArray(value.scopes)
  ) {
    throw new SecureMcpError(
      'invalid_input',
      `Client at index ${index} needs id, tokenHash, and scopes.`,
    )
  }
  const client: ClientRecord = {
    id: value.id,
    tokenHash: value.tokenHash,
    scopes: value.scopes.filter((s): s is string => typeof s === 'string'),
  }
  // A present `targets` must be an array of strings. A malformed value is
  // rejected, never silently dropped: dropping it would widen the token's reach
  // to every target instead of the intended restriction.
  if (value.targets !== undefined) {
    if (
      !Array.isArray(value.targets) ||
      !value.targets.every((t) => typeof t === 'string')
    ) {
      throw new SecureMcpError(
        'invalid_input',
        `Client at index ${index} has a "targets" that is not an array of strings.`,
      )
    }
    client.targets = value.targets
  }
  // A present `expiresAt` must be a finite number (Unix seconds). A malformed
  // value is rejected, never silently dropped: dropping it would turn an
  // intended expiry into a token that never expires.
  if (value.expiresAt !== undefined) {
    if (
      typeof value.expiresAt !== 'number' ||
      !Number.isFinite(value.expiresAt)
    ) {
      throw new SecureMcpError(
        'invalid_input',
        `Client at index ${index} has an "expiresAt" that is not a finite number.`,
      )
    }
    client.expiresAt = value.expiresAt
  }
  return client
}

/**
 * Reads a clients file: a JSON array of `{ id, tokenHash, scopes, targets?,
 * expiresAt? }`. The file holds token hashes only, never a raw token.
 */
export async function clientsFromFile(
  path: string,
): Promise<Array<ClientRecord>> {
  let data: unknown
  try {
    data = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'read failed'
    throw new SecureMcpError('invalid_input', `Cannot read ${path}: ${detail}`)
  }
  if (!Array.isArray(data)) {
    throw new SecureMcpError('invalid_input', `${path} must be a JSON array.`)
  }
  return data.map(toClient)
}
