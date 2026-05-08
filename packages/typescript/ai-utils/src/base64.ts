/**
 * Cross-runtime base64 helpers.
 *
 * Both `arrayBufferToBase64` and `base64ToArrayBuffer` prefer the new native
 * `Uint8Array.toBase64()` / `Uint8Array.fromBase64()` methods (TC39 base64
 * proposal, Stage 3) when available — they are significantly faster and more
 * memory-efficient than the byte-walking fallback. The fallbacks use Node's
 * `Buffer` when present, then `atob`/`btoa` for browser / edge runtimes.
 */

interface Uint8ArrayWithBase64 {
  fromBase64?: (input: string) => Uint8Array
}

interface Uint8ArrayInstanceWithBase64 {
  toBase64?: () => string
}

/**
 * Encode an `ArrayBuffer` as a base64 string.
 *
 * Note: callers should be cautious about feeding large buffers (more than a
 * few megabytes) on serverless / Workers runtimes — converting big media to
 * base64 multiplies its memory footprint by ~1.33× and frequently OOMs the
 * isolate.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)

  const fast = (bytes as Uint8ArrayInstanceWithBase64).toBase64
  if (typeof fast === 'function') {
    return fast.call(bytes)
  }

  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(buffer).toString('base64')
  }

  if (typeof btoa === 'function') {
    let binary = ''
    // 32KB chunks keep us well under V8's argument-count limits for
    // String.fromCharCode.apply on large buffers.
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode.apply(
        null,
        chunk as unknown as Array<number>,
      )
    }
    return btoa(binary)
  }

  throw new Error('No base64 encoder available in this environment.')
}

/**
 * Decode a base64 string into an `ArrayBuffer`.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const fast = (Uint8Array as unknown as Uint8ArrayWithBase64).fromBase64
  if (typeof fast === 'function') {
    return fast(base64).buffer as ArrayBuffer
  }

  if (typeof atob === 'function') {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }

  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    const buf = Buffer.from(base64, 'base64')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  }

  throw new Error('No base64 decoder available in this environment.')
}
