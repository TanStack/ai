import { afterEach, describe, expect, it } from 'vitest'
import {
  BYOK_HEADER_PREFIX,
  ByokMissingError,
  byokHeaderName,
  byokMissing,
  getByokKey,
  getByokOrEnvKey,
  isByokMissingBody,
  isProviderId,
  maskKey,
  scrubSecrets,
} from '../src/byok'

describe('byok registry', () => {
  it('names the header x-byok-<provider>', () => {
    expect(byokHeaderName('openai')).toBe('x-byok-openai')
    expect(BYOK_HEADER_PREFIX).toBe('x-byok-')
  })

  it('guards known provider ids', () => {
    expect(isProviderId('openai')).toBe(true)
    expect(isProviderId('not-a-provider')).toBe(false)
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

  it('rejects unknown providers and other shapes', () => {
    expect(
      isByokMissingBody({
        error: { type: 'byok_missing', provider: 'nope', message: 'x' },
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
