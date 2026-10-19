import { base64url } from './utils'

/**
 * How a media signer gets its keys.
 *
 * - `secret`: one key. It signs and verifies.
 * - `keys`: a key list, to rotate keys. The first key signs. Every key
 *   verifies, so a URL that an old key signed works until it expires.
 *
 * Each key must be at least {@link MIN_KEY_BYTES} bytes (UTF-8).
 */
export type MediaSignerOptions =
  | { secret: string }
  | { keys: ReadonlyArray<string> }

/** The smallest key length in bytes. HMAC SHA-256 wants 32 bytes or more. */
export const MIN_KEY_BYTES = 32

const HMAC = { name: 'HMAC', hash: 'SHA-256' }

const encoder = new TextEncoder()

/** Base64url to bytes, or `undefined` for a value that is not base64url. */
function fromBase64url(value: string) {
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return undefined
  }
}

/** The keys of `options`, first the key that signs. */
function keysOf(options: MediaSignerOptions) {
  return 'secret' in options ? [options.secret] : options.keys
}

/** `bytes` as an HMAC SHA-256 key that signs and verifies. */
function importHmacKey(bytes: Uint8Array<ArrayBuffer>) {
  return crypto.subtle.importKey('raw', bytes, HMAC, false, ['sign', 'verify'])
}

/**
 * Make a signer for media URLs. It signs with HMAC SHA-256 through Web Crypto
 * (`crypto.subtle`), so it runs on Node, Deno, Bun, and edge runtimes.
 *
 * `payload` is the text that the URL must keep unchanged, for example the
 * harness name, tenant, thread, media id, user, and expiry, one per line. A
 * signature is base64url without padding.
 *
 * Throws an `Error` when there is no key, or when a key is shorter than
 * {@link MIN_KEY_BYTES} bytes (UTF-8).
 *
 * @example
 * ```ts
 * const signer = createMediaSigner({ keys: [newSecret, oldSecret] })
 * const sig = await signer.sign(payload)
 * const isValid = await signer.verify(payload, sig)
 * ```
 */
export function createMediaSigner(options: MediaSignerOptions) {
  const encoded = keysOf(options).map((secret) => encoder.encode(secret))
  const [signingBytes, ...otherBytes] = encoded
  if (signingBytes === undefined) {
    throw new Error('Media signing needs at least one key.')
  }
  for (const [index, bytes] of encoded.entries()) {
    if (bytes.byteLength < MIN_KEY_BYTES) {
      throw new Error(
        `Media signing key ${index} is ${bytes.byteLength} bytes. Use a key of at least ${MIN_KEY_BYTES} bytes (UTF-8).`,
      )
    }
  }
  // Import each key one time, on first use.
  let imported:
    | { signing: Promise<CryptoKey>; all: Promise<Array<CryptoKey>> }
    | undefined
  const cryptoKeys = () => {
    if (imported) return imported
    const signing = importHmacKey(signingBytes)
    imported = {
      signing,
      all: Promise.all([signing, ...otherBytes.map(importHmacKey)]),
    }
    return imported
  }

  return {
    /** The base64url signature of `payload`, made with the first key. */
    async sign(payload: string) {
      const signature = await crypto.subtle.sign(
        'HMAC',
        await cryptoKeys().signing,
        encoder.encode(payload),
      )
      return base64url(new Uint8Array(signature))
    },
    /**
     * True when one of the keys signed `payload` as `signature`. Each key
     * checks in constant time (`crypto.subtle.verify`). Every key checks, so
     * the time does not tell which key matched.
     */
    async verify(payload: string, signature: string) {
      const bytes = fromBase64url(signature)
      if (bytes === undefined) return false
      const data = encoder.encode(payload)
      const keys = await cryptoKeys().all
      const results = await Promise.all(
        keys.map((key) => crypto.subtle.verify('HMAC', key, bytes, data)),
      )
      return results.includes(true)
    },
  }
}
