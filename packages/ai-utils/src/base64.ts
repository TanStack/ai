interface Uint8ArrayWithBase64 {
  fromBase64?: (input: string) => Uint8Array
}

interface Uint8ArrayInstanceWithBase64 {
  toBase64?: () => string
}

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
        // oxlint-disable-next-line eslint-js/no-restricted-syntax -- TS lib types String.fromCharCode.apply as Array<number> but runtime accepts any ArrayLike
        chunk as unknown as Array<number>,
      )
    }
    return btoa(binary)
  }

  throw new Error('No base64 encoder available in this environment.')
}

export function base64ToUint8Array(base64: string): Uint8Array {
  return new Uint8Array(base64ToArrayBuffer(base64))
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- feature-detecting Uint8Array.fromBase64 Stage-3 proposal not yet in lib.es types
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
