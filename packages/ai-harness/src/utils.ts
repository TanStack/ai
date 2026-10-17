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

/**
 * The longest delay of one `setTimeout` (about 24.8 days). A longer wait
 * waits in parts.
 */
export const MAX_TIMER_MS = 2_147_483_647

/**
 * Resolve at the epoch time `until`, or reject with the reason of `signal`
 * when it aborts first.
 */
export async function waitUntil(until: number, signal?: AbortSignal) {
  for (;;) {
    signal?.throwIfAborted()
    const left = until - Date.now()
    if (left <= 0) return
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        reject(signal?.reason)
      }
      const timer = setTimeout(
        () => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        },
        Math.min(left, MAX_TIMER_MS),
      )
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }
}
