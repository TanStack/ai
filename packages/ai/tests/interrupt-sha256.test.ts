import { describe, expect, it } from 'vitest'
import { defaultInterruptHash } from '../src/interrupt-serialization'

// Known SHA-256 vectors (FIPS 180-4 / common test values). If the bundled
// implementation drifts, these fail loudly. The last case crosses the 64-byte
// block boundary to exercise multi-block processing.
describe('defaultInterruptHash (bundled SHA-256)', () => {
  const cases: Array<[string, string]> = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ]

  it.each(cases)('hashes %j', (input, expectedHex) => {
    expect(defaultInterruptHash(input)).toBe(`sha256:${expectedHex}`)
  })

  it('is deterministic and UTF-8 aware', () => {
    expect(defaultInterruptHash('héllo 🌍')).toBe(
      defaultInterruptHash('héllo 🌍'),
    )
    expect(defaultInterruptHash('a')).not.toBe(defaultInterruptHash('b'))
  })
})
