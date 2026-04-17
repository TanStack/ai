import { describe, expect, it, vi } from 'vitest'
import { warnIfBindingsExposeSecrets } from '../src/validate-bindings'

describe('warnIfBindingsExposeSecrets', () => {
  it('should warn when input schema has secret-like parameter names', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets([
      {
        name: 'callApi',
        description: 'Call an API',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            apiKey: { type: 'string' },
          },
        },
      },
    ])

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('apiKey'))
    warnSpy.mockRestore()
  })

  it('should not warn for safe parameter names', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets([
      {
        name: 'search',
        description: 'Search items',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' },
          },
        },
      },
    ])

    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('should detect multiple secret patterns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets([
      {
        name: 'auth',
        description: 'Auth tool',
        inputSchema: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            password: { type: 'string' },
            username: { type: 'string' },
          },
        },
      },
    ])

    const calls = warnSpy.mock.calls.map((c) => c[0])
    expect(calls.some((c: string) => c.includes('token'))).toBe(true)
    expect(calls.some((c: string) => c.includes('password'))).toBe(true)
    // username should NOT trigger a warning
    expect(calls.some((c: string) => c.includes('username'))).toBe(false)
    warnSpy.mockRestore()
  })

  it('should handle tools with no inputSchema', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets([
      {
        name: 'simple',
        description: 'Simple tool',
      },
    ])

    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('should detect api_key and api-key variations', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets([
      {
        name: 'tool1',
        inputSchema: {
          type: 'object',
          properties: { api_key: { type: 'string' } },
        },
      },
      {
        name: 'tool2',
        inputSchema: {
          type: 'object',
          properties: { 'api-key': { type: 'string' } },
        },
      },
    ])

    expect(warnSpy).toHaveBeenCalledTimes(2)
    warnSpy.mockRestore()
  })
})
