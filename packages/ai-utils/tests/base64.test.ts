import { describe, it, expect } from 'vitest'
import { arrayBufferToBase64, base64ToArrayBuffer } from '../src/base64'

describe('base64 helpers', () => {
  it('round-trips bytes through arrayBufferToBase64 and base64ToArrayBuffer', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 254, 255, 128, 64, 32])
    const base64 = arrayBufferToBase64(bytes.buffer)
    const decoded = new Uint8Array(base64ToArrayBuffer(base64))
    expect(Array.from(decoded)).toEqual(Array.from(bytes))
  })

  it('encodes a known string to the expected base64', () => {
    const bytes = new TextEncoder().encode('hello world')
    expect(arrayBufferToBase64(bytes.buffer)).toBe('aGVsbG8gd29ybGQ=')
  })

  it('decodes a known base64 string to the expected bytes', () => {
    const decoded = new Uint8Array(base64ToArrayBuffer('aGVsbG8gd29ybGQ='))
    expect(new TextDecoder().decode(decoded)).toBe('hello world')
  })

  it('handles a multi-megabyte buffer without overflowing the call stack', () => {
    // 1.5 MiB of pseudo-random bytes — exercises the chunked btoa fallback
    // when the fast Uint8Array.toBase64 path is unavailable.
    const size = 1.5 * 1024 * 1024
    const bytes = new Uint8Array(size)
    for (let i = 0; i < size; i++) bytes[i] = i & 0xff

    const base64 = arrayBufferToBase64(bytes.buffer)
    const decoded = new Uint8Array(base64ToArrayBuffer(base64))
    expect(decoded.length).toBe(size)
    // Spot-check a few entries rather than comparing the full buffer.
    expect(decoded[0]).toBe(0)
    expect(decoded[255]).toBe(255)
    expect(decoded[size - 1]).toBe((size - 1) & 0xff)
  })
})
