import { describe, expect, it } from 'vitest'
import { MCPEventConfigError } from '../../src/errors'
import {
  createMCPEventSecret,
  decodeMCPEventSecret,
} from '../../src/events/secret'

function secretFromBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `whsec_${btoa(binary)}`
}

describe('createMCPEventSecret', () => {
  it('matches the Standard Webhooks prefix and decodes to 32 bytes', () => {
    const secret = createMCPEventSecret()
    expect(secret).toMatch(/^whsec_[A-Za-z0-9+/]+=*$/)
    expect(decodeMCPEventSecret(secret).byteLength).toBe(32)
  })

  it('returns different values on two calls', () => {
    expect(createMCPEventSecret()).not.toBe(createMCPEventSecret())
  })
})

describe('decodeMCPEventSecret', () => {
  it('accepts 24 and 64 byte secrets', () => {
    expect(
      decodeMCPEventSecret(secretFromBytes(new Uint8Array(24))).byteLength,
    ).toBe(24)
    expect(
      decodeMCPEventSecret(secretFromBytes(new Uint8Array(64))).byteLength,
    ).toBe(64)
  })

  it('rejects 23 and 65 byte secrets', () => {
    expect(() =>
      decodeMCPEventSecret(secretFromBytes(new Uint8Array(23))),
    ).toThrow(MCPEventConfigError)
    expect(() =>
      decodeMCPEventSecret(secretFromBytes(new Uint8Array(65))),
    ).toThrow(MCPEventConfigError)
  })

  it('rejects a missing prefix', () => {
    expect(() => decodeMCPEventSecret('not-a-secret')).toThrow(
      MCPEventConfigError,
    )
  })

  it('rejects non-base64', () => {
    expect(() => decodeMCPEventSecret('whsec_????')).toThrow(
      MCPEventConfigError,
    )
  })
})
