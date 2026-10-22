import { describe, expect, it } from 'vitest'
import { createMediaSigner } from '../src/media-signing'

/** Two keys of 32 bytes or more. */
const OLD_KEY = 'old-key-0123456789-0123456789-0123'
const NEW_KEY = 'new-key-0123456789-0123456789-0123'

/** A payload in the form of a signed media URL: one field per line. */
const PAYLOAD = [
  'test/harness',
  'tenant-1',
  'thread-1',
  'media-1',
  'user-1',
  '1900000000000',
].join('\n')

describe('createMediaSigner', () => {
  it('verifies a signature that it made', async () => {
    const signer = createMediaSigner({ secret: NEW_KEY })
    const signature = await signer.sign(PAYLOAD)

    // Base64url of a 32-byte HMAC SHA-256, without padding.
    expect(signature).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(await signer.verify(PAYLOAD, signature)).toBe(true)
  })

  it('refuses a payload that changed after it was signed', async () => {
    const signer = createMediaSigner({ secret: NEW_KEY })
    const signature = await signer.sign(PAYLOAD)
    const tampered = PAYLOAD.replace('user-1', 'user-2')

    expect(await signer.verify(tampered, signature)).toBe(false)
  })

  it('refuses a signature that is not base64url', async () => {
    const signer = createMediaSigner({ secret: NEW_KEY })

    expect(await signer.verify(PAYLOAD, '%%%')).toBe(false)
  })

  it('refuses a signature from a key that it does not have', async () => {
    const other = createMediaSigner({ secret: OLD_KEY })
    const signer = createMediaSigner({ secret: NEW_KEY })

    expect(await signer.verify(PAYLOAD, await other.sign(PAYLOAD))).toBe(false)
  })

  it('signs with the first key and verifies with every key', async () => {
    const before = createMediaSigner({ secret: OLD_KEY })
    const after = createMediaSigner({ keys: [NEW_KEY, OLD_KEY] })
    const newOnly = createMediaSigner({ secret: NEW_KEY })
    const oldSignature = await before.sign(PAYLOAD)
    const newSignature = await after.sign(PAYLOAD)

    expect(await after.verify(PAYLOAD, oldSignature)).toBe(true)
    expect(await newOnly.verify(PAYLOAD, newSignature)).toBe(true)
    expect(await before.verify(PAYLOAD, newSignature)).toBe(false)
  })

  it('throws for a key shorter than 32 bytes', () => {
    expect(() => createMediaSigner({ secret: 'short-secret' })).toThrow(
      'Media signing key 0 is 12 bytes. Use a key of at least 32 bytes (UTF-8).',
    )
  })

  it('counts key length in UTF-8 bytes, not in characters', () => {
    // 16 characters, 32 bytes: each character is 2 bytes in UTF-8.
    const twoByteKey = 'é'.repeat(16)

    expect(() => createMediaSigner({ secret: twoByteKey })).not.toThrow()
    expect(() => createMediaSigner({ secret: 'é'.repeat(15) })).toThrow(
      'Media signing key 0 is 30 bytes.',
    )
  })

  it('throws for an empty key list', () => {
    expect(() => createMediaSigner({ keys: [] })).toThrow(
      'Media signing needs at least one key.',
    )
  })
})
