import { describe, expect, it } from 'vitest'
import { MCPEventConfigError } from '../../src/errors'
import {
  readCallbackKey,
  validateCallbackUrl,
  withCallbackKey,
} from '../../src/events/callback-url'

describe('validateCallbackUrl', () => {
  it('accepts https://x.test/hook', () => {
    expect(validateCallbackUrl('https://x.test/hook').href).toBe(
      'https://x.test/hook',
    )
  })

  it('rejects http://x.test/hook', () => {
    expect(() => validateCallbackUrl('http://x.test/hook')).toThrow(
      MCPEventConfigError,
    )
  })

  it('accepts loopback http only with the flag', () => {
    expect(() =>
      validateCallbackUrl('http://127.0.0.1:3000/h', {
        allowInsecureLocalhost: true,
      }),
    ).not.toThrow()
    expect(() =>
      validateCallbackUrl('http://[::1]:3000/h', {
        allowInsecureLocalhost: true,
      }),
    ).not.toThrow()
    expect(() => validateCallbackUrl('http://127.0.0.1:3000/h')).toThrow(
      MCPEventConfigError,
    )
    expect(() => validateCallbackUrl('http://[::1]:3000/h')).toThrow(
      MCPEventConfigError,
    )
  })

  it('rejects http://localhost even with the flag', () => {
    expect(() =>
      validateCallbackUrl('http://localhost:3000/h', {
        allowInsecureLocalhost: true,
      }),
    ).toThrow(MCPEventConfigError)
  })

  it('rejects credentials', () => {
    expect(() => validateCallbackUrl('https://u:p@x.test/h')).toThrow(
      MCPEventConfigError,
    )
  })

  it('rejects a fragment', () => {
    expect(() => validateCallbackUrl('https://x.test/h#a')).toThrow(
      MCPEventConfigError,
    )
  })

  it('rejects an existing mcp_event_subscription parameter', () => {
    expect(() =>
      validateCallbackUrl('https://x.test/h?mcp_event_subscription=1'),
    ).toThrow(MCPEventConfigError)
  })
})

describe('withCallbackKey and readCallbackKey', () => {
  it('appends the key and round-trips', () => {
    const url = withCallbackKey(new URL('https://x.test/h?a=1'), 'k')
    expect(url).toBe('https://x.test/h?a=1&mcp_event_subscription=k')
    expect(readCallbackKey(url)).toBe('k')
  })
})
