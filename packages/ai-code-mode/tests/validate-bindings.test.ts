import { describe, expect, it, vi } from 'vitest'
import { warnIfBindingsExposeSecrets } from '../src/validate-bindings'
import type { SecretParameterInfo } from '../src/validate-bindings'

describe('warnIfBindingsExposeSecrets — top-level detection', () => {
  it('warns when input schema has a secret-like parameter name', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets([
      {
        name: 'callApi',
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

  it('does not warn for safe parameter names', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets([
      {
        name: 'search',
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

  it('detects multiple secret patterns in a single tool', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets([
      {
        name: 'auth',
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

    const calls = warnSpy.mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('token'))).toBe(true)
    expect(calls.some((c) => c.includes('password'))).toBe(true)
    expect(calls.some((c) => c.includes('username'))).toBe(false)
    warnSpy.mockRestore()
  })

  it('handles tools with no inputSchema', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets([{ name: 'simple' }])

    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('warnIfBindingsExposeSecrets — name patterns', () => {
  const secretNames = [
    'apiKey',
    'api_key',
    'api-key',
    'APIKey',
    'accessToken',
    'access_token',
    'bearerToken',
    'refreshToken',
    'sessionToken',
    'clientSecret',
    'client_secret',
    'webhookSecret',
    'authorization',
    'Authorization',
    'password',
    'Password',
    'passcode',
    'pwd',
    'jwt',
    'privateKey',
    'private_key',
    'openaiApiKey',
    'openai_api_key',
    'githubToken',
    'x-api-key',
  ]

  it.each(secretNames)('warns on parameter named "%s"', (paramName) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets([
      {
        name: 'tool',
        inputSchema: {
          type: 'object',
          properties: { [paramName]: { type: 'string' } },
        },
      },
    ])

    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  const safeNames = [
    'username',
    'email',
    'query',
    'limit',
    'offset',
    'url',
    'path',
    'id',
    'userId',
    'foreignKey',
    'sortKey',
    'partitionKey',
    'tokenizer',
    'tokenization',
    'tokens',
    'keyboardLayout',
  ]

  it.each(safeNames)('does NOT warn on safe parameter "%s"', (paramName) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets([
      {
        name: 'tool',
        inputSchema: {
          type: 'object',
          properties: { [paramName]: { type: 'string' } },
        },
      },
    ])

    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('warnIfBindingsExposeSecrets — nested schema recursion', () => {
  it('detects secrets nested inside an object property', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets([
      {
        name: 'nested',
        inputSchema: {
          type: 'object',
          properties: {
            auth: {
              type: 'object',
              properties: {
                token: { type: 'string' },
              },
            },
          },
        },
      },
    ])

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('auth.token'))
    warnSpy.mockRestore()
  })

  it('detects secrets inside array items', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets([
      {
        name: 'arr',
        inputSchema: {
          type: 'object',
          properties: {
            headers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  apiKey: { type: 'string' },
                },
              },
            },
          },
        },
      },
    ])

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('apiKey'))
    warnSpy.mockRestore()
  })

  it('detects secrets inside anyOf/oneOf/allOf branches', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets([
      {
        name: 'unioned',
        inputSchema: {
          type: 'object',
          properties: {
            credentials: {
              anyOf: [
                {
                  type: 'object',
                  properties: { password: { type: 'string' } },
                },
                {
                  type: 'object',
                  properties: { jwt: { type: 'string' } },
                },
              ],
            },
          },
        },
      },
    ])

    const calls = warnSpy.mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('password'))).toBe(true)
    expect(calls.some((c) => c.includes('jwt'))).toBe(true)
    warnSpy.mockRestore()
  })

  it('resolves and scans $ref targets in $defs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets([
      {
        name: 'refs',
        inputSchema: {
          $defs: {
            Creds: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
              },
            },
          },
          type: 'object',
          properties: {
            creds: { $ref: '#/$defs/Creds' },
          },
        },
      },
    ])

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('accessToken'))
    warnSpy.mockRestore()
  })

  it('scans additionalProperties schemas', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets([
      {
        name: 'dict',
        inputSchema: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              secret: { type: 'string' },
            },
          },
        },
      },
    ])

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('secret'))
    warnSpy.mockRestore()
  })

  it('does not loop forever on schemas that self-reference via cycles', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const cyclic: Record<string, unknown> = { type: 'object', properties: {} }
    ;(cyclic.properties as Record<string, unknown>).self = cyclic
    ;(cyclic.properties as Record<string, unknown>).secret = { type: 'string' }

    warnIfBindingsExposeSecrets([
      { name: 'cycle', inputSchema: cyclic as Record<string, unknown> },
    ])

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('secret'))
    warnSpy.mockRestore()
  })
})

describe('warnIfBindingsExposeSecrets — handler variants', () => {
  it('handler: "ignore" suppresses warnings', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnIfBindingsExposeSecrets(
      [
        {
          name: 't',
          inputSchema: {
            type: 'object',
            properties: { apiKey: { type: 'string' } },
          },
        },
      ],
      { handler: 'ignore' },
    )

    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('handler: "throw" throws on the first match', () => {
    expect(() =>
      warnIfBindingsExposeSecrets(
        [
          {
            name: 't',
            inputSchema: {
              type: 'object',
              properties: { apiKey: { type: 'string' } },
            },
          },
        ],
        { handler: 'throw' },
      ),
    ).toThrow(/apiKey/)
  })

  it('handler: function receives each match', () => {
    const matches: Array<SecretParameterInfo> = []

    warnIfBindingsExposeSecrets(
      [
        {
          name: 'callApi',
          inputSchema: {
            type: 'object',
            properties: {
              apiKey: { type: 'string' },
              nested: {
                type: 'object',
                properties: { token: { type: 'string' } },
              },
            },
          },
        },
      ],
      { handler: (info) => matches.push(info) },
    )

    expect(matches).toHaveLength(2)
    expect(matches[0]).toMatchObject({
      toolName: 'callApi',
      paramName: 'apiKey',
      paramPath: ['apiKey'],
    })
    expect(matches[1]).toMatchObject({
      toolName: 'callApi',
      paramName: 'token',
      paramPath: ['nested', 'token'],
    })
  })
})

describe('warnIfBindingsExposeSecrets — dedup', () => {
  it('does not surface the same (tool, paramPath) twice across calls when a shared cache is passed', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cache = new Set<string>()

    const tool = {
      name: 'api',
      inputSchema: {
        type: 'object',
        properties: { apiKey: { type: 'string' } },
      },
    }

    warnIfBindingsExposeSecrets([tool], { dedupCache: cache })
    warnIfBindingsExposeSecrets([tool], { dedupCache: cache })

    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  it('still surfaces a different paramPath on the second call', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cache = new Set<string>()

    warnIfBindingsExposeSecrets(
      [
        {
          name: 'api',
          inputSchema: {
            type: 'object',
            properties: { apiKey: { type: 'string' } },
          },
        },
      ],
      { dedupCache: cache },
    )
    warnIfBindingsExposeSecrets(
      [
        {
          name: 'api',
          inputSchema: {
            type: 'object',
            properties: { secret: { type: 'string' } },
          },
        },
      ],
      { dedupCache: cache },
    )

    expect(warnSpy).toHaveBeenCalledTimes(2)
    warnSpy.mockRestore()
  })
})
