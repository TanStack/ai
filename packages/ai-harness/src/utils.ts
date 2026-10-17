export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Base64url (RFC 4648 section 5) without padding. */
export function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * A JSON copy of `value`, as a store gives it back. `undefined` when `value`
 * is not JSON: a cycle or a `BigInt` throws in `JSON.stringify`.
 */
export function jsonCopy(value: unknown) {
  try {
    const text: string | undefined = JSON.stringify(value)
    if (text === undefined) return undefined
    const copy: unknown = JSON.parse(text)
    return copy
  } catch {
    return undefined
  }
}
