import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import {
  BYOK_HEADER_PREFIX,
  ByokMissingError,
  byokHeaderName,
  byokMissing,
  byokValidateMap,
  defineByokProvider,
  getByokKey,
  getByokOrEnvKey,
  isByokMissingBody,
  isProviderId,
  maskKey,
  scrubSecrets,
} from '../src/byok'
import type { ByokProviderInit } from '../src/byok'

describe('byok slugs', () => {
  it('names the header x-byok-<provider>', () => {
    expect(byokHeaderName('openai')).toBe('x-byok-openai')
    expect(byokHeaderName('bedrock')).toBe('x-byok-bedrock')
    expect(BYOK_HEADER_PREFIX).toBe('x-byok-')
  })

  it('accepts any lowercase slug, not a catalog', () => {
    expect(isProviderId('openai')).toBe(true)
    expect(isProviderId('not-a-provider')).toBe(true)
    expect(isProviderId('bedrock')).toBe(true)
    expect(isProviderId('my-llm')).toBe(true)
    expect(isProviderId('OpenAI')).toBe(false)
    expect(isProviderId('foo_bar')).toBe(false)
    expect(isProviderId('-leading')).toBe(false)
    expect(isProviderId('1abc')).toBe(false)
    expect(isProviderId('has space')).toBe(false)
    expect(isProviderId('')).toBe(false)
    expect(isProviderId(`a${'b'.repeat(64)}`)).toBe(false)
  })

  it('throws on an invalid header id', () => {
    expect(() => byokHeaderName('OpenAI')).toThrow(/Invalid BYOK provider id/)
  })
})

describe('defineByokProvider', () => {
  it('requires a slug and returns it', () => {
    const provider = defineByokProvider({
      id: 'openai',
      label: 'OpenAI',
      validate: {
        url: 'https://api.openai.com/v1/models',
        headers: (key) => ({ Authorization: `Bearer ${key}` }),
      },
    })
    expect(provider.id).toBe('openai')
    expect(provider.label).toBe('OpenAI')
    expect(provider.validate?.url).toBe('https://api.openai.com/v1/models')
    expectTypeOf(provider.id).toEqualTypeOf<'openai'>()
  })

  it('makes an optional slug unassignable to ByokProviderInit', () => {
    expectTypeOf<{ id?: 'openai'; label: string }>().not.toMatchTypeOf<
      ByokProviderInit<'openai'>
    >()
    expectTypeOf<{ label: string }>().not.toMatchTypeOf<
      ByokProviderInit<'openai'>
    >()
  })

  it('throws on an invalid slug', () => {
    expect(() =>
      defineByokProvider({
        id: 'OpenAI',
        label: 'OpenAI',
      }),
    ).toThrow(/Invalid BYOK provider id/)
  })

  it('builds a validate map from providers that have one', () => {
    const openai = defineByokProvider({
      id: 'openai',
      label: 'OpenAI',
      validate: {
        url: 'https://api.openai.com/v1/models',
        headers: (key) => ({ Authorization: `Bearer ${key}` }),
      },
    })
    const ollama = defineByokProvider({ id: 'ollama', label: 'Ollama' })
    const map = byokValidateMap([openai, ollama])
    expect(Object.keys(map)).toEqual(['openai'])
  })
})

describe('isByokMissingBody', () => {
  it('accepts the typed 401 body', () => {
    expect(
      isByokMissingBody({
        error: {
          type: 'byok_missing',
          provider: 'openai',
          message: 'Missing OpenAI key',
        },
      }),
    ).toBe(true)
  })

  it('accepts any slug provider and rejects invalid shapes', () => {
    expect(
      isByokMissingBody({
        error: { type: 'byok_missing', provider: 'bedrock', message: 'x' },
      }),
    ).toBe(true)
    expect(
      isByokMissingBody({
        error: { type: 'byok_missing', provider: 'OpenAI', message: 'x' },
      }),
    ).toBe(false)
    expect(isByokMissingBody({ error: 'nope' })).toBe(false)
    expect(isByokMissingBody(null)).toBe(false)
  })
})

describe('getByokKey', () => {
  it('reads the header and ignores the body', async () => {
    const request = new Request('https://example.test/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-byok-openai': 'sk-live',
      },
      body: JSON.stringify({ apiKey: 'sk-in-body', messages: [] }),
    })
    expect(getByokKey(request, 'openai')).toBe('sk-live')
    expect(getByokKey(request, 'anthropic')).toBe(null)
  })
})

describe('getByokOrEnvKey', () => {
  const envName = 'TANSTACK_AI_BYOK_TEST_KEY'
  afterEach(() => {
    delete process.env[envName]
  })

  it('prefers the header over env', () => {
    process.env[envName] = 'sk-env'
    const request = new Request('https://example.test/chat', {
      headers: { 'x-byok-openai': 'sk-header' },
    })
    expect(getByokOrEnvKey(request, 'openai', [envName])).toBe('sk-header')
  })

  it('falls back to env when the header is absent', () => {
    process.env[envName] = 'sk-env'
    const request = new Request('https://example.test/chat')
    expect(getByokOrEnvKey(request, 'openai', [envName])).toBe('sk-env')
  })
})

describe('byokMissing', () => {
  it('returns a 401 with a typed body', async () => {
    const response = byokMissing('openai')
    expect(response.status).toBe(401)
    const body: unknown = await response.json()
    expect(isByokMissingBody(body)).toBe(true)
    if (isByokMissingBody(body)) {
      expect(body.error.provider).toBe('openai')
    }
  })

  it('accepts slugs outside the old first-party list', async () => {
    const response = byokMissing('bedrock')
    const body: unknown = await response.json()
    expect(isByokMissingBody(body)).toBe(true)
  })

  it('throws on an invalid provider id', () => {
    expect(() => byokMissing('OpenAI')).toThrow(/Invalid BYOK provider id/)
  })
})

describe('mask and scrub', () => {
  it('masks to last 4', () => {
    expect(maskKey('sk-abcdefghij')).toBe('ghij')
    expect(maskKey('ab')).toBe('••')
  })

  it('scrubs listed secrets from a string', () => {
    expect(scrubSecrets('failed sk-live extra', ['sk-live'])).toBe(
      'failed [redacted] extra',
    )
  })
})

describe('ByokMissingError', () => {
  it('is instanceof-checkable and carries the provider', () => {
    const error = new ByokMissingError('gemini')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ByokMissingError)
    expect(error.provider).toBe('gemini')
    expect(error.name).toBe('ByokMissingError')
  })
})
