import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import {
  BYOK_HEADER_PREFIX,
  ByokMissingError,
  ByokUnresolvedProviderError,
  byokHeaderName,
  byokMissing,
  defineByokProvider,
  isByokMissingBody,
  isProviderId,
  maskKey,
  scrubSecrets,
} from '../src/byok'
import {
  getByokKey,
  getByokKeys,
  memoryCredentialStore,
  readCredential,
  storedProviderKeys,
} from '../src/byok/server'
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
    })
    expect(provider.id).toBe('openai')
    expect(provider.label).toBe('OpenAI')
    expectTypeOf(provider.id).toEqualTypeOf<'openai'>()
  })

  it('normalizes env to an array', () => {
    const provider = defineByokProvider({
      id: 'fal',
      label: 'fal.ai',
      env: 'FAL_KEY',
    })
    expect(provider.env).toEqual(['FAL_KEY'])
  })

  it('keeps an env list in order', () => {
    const provider = defineByokProvider({
      id: 'gemini',
      label: 'Google Gemini',
      env: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    })
    expect(provider.env).toEqual(['GOOGLE_API_KEY', 'GEMINI_API_KEY'])
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
  const envName = 'TANSTACK_AI_BYOK_TEST_KEY'
  afterEach(() => {
    delete process.env[envName]
  })

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

  it('does not read env for a slug', () => {
    process.env[envName] = 'sk-env'
    const request = new Request('https://example.test/chat')
    expect(getByokKey(request, 'openai')).toBe(null)
  })

  it('reads env names from the provider', () => {
    process.env[envName] = 'sk-env'
    const fal = defineByokProvider({
      id: 'fal',
      label: 'fal.ai',
      env: envName,
    })
    const request = new Request('https://example.test/chat')
    expect(getByokKey(request, fal)).toBe('sk-env')
  })

  it('prefers the header when given a provider object', () => {
    process.env[envName] = 'sk-env'
    const fal = defineByokProvider({
      id: 'fal',
      label: 'fal.ai',
      env: envName,
    })
    const request = new Request('https://example.test/chat', {
      headers: { 'x-byok-fal': 'sk-header' },
    })
    expect(getByokKey(request, fal)).toBe('sk-header')
  })
})

describe('defineByokProvider with companions', () => {
  it('keeps the companion descriptors', () => {
    const account = defineByokProvider({ id: 'acme-account', label: 'Account' })
    const token = defineByokProvider({
      id: 'acme',
      label: 'Token',
      with: [account],
    })
    expect(token.with).toEqual([account])
  })
})

describe('getByokKeys', () => {
  it('reads one value per name', () => {
    const request = new Request('https://example.test/chat', {
      headers: { 'x-byok-cloudflare': 'tok' },
    })
    expect(
      getByokKeys(request, {
        apiKey: 'cloudflare',
        accountId: 'cloudflare-account',
      }),
    ).toEqual({ apiKey: 'tok', accountId: null })
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

  it('accepts a provider object', async () => {
    const fal = defineByokProvider({
      id: 'fal',
      label: 'fal.ai',
      env: 'FAL_KEY',
    })
    const response = byokMissing(fal)
    const body: unknown = await response.json()
    expect(isByokMissingBody(body)).toBe(true)
    if (isByokMissingBody(body)) {
      expect(body.error.provider).toBe('fal')
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

describe('ByokUnresolvedProviderError', () => {
  it('is instanceof-checkable', () => {
    const error = new ByokUnresolvedProviderError()
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ByokUnresolvedProviderError)
    expect(error.name).toBe('ByokUnresolvedProviderError')
  })
})

describe('stored credentials', () => {
  const user = { tenantId: 'acme', userId: 'ann' }
  const tenant = { tenantId: 'acme' }

  it('keys by user and tenant, lists without values, and deletes', async () => {
    const credentials = memoryCredentialStore()
    await credentials.set({
      scope: user,
      id: 'github',
      credential: {
        type: 'oauth',
        accessToken: 'secret-access',
        refreshToken: 'secret-refresh',
        expiresAt: 100,
      },
    })
    await credentials.set({
      scope: tenant,
      id: 'notion',
      credential: { type: 'api_key', value: 'secret-key' },
    })

    expect(await credentials.get({ scope: user, id: 'github' })).toMatchObject({
      accessToken: 'secret-access',
    })
    // A user credential is not visible at tenant scope, and the other way around.
    expect(await credentials.get({ scope: tenant, id: 'github' })).toBeNull()
    expect(await credentials.get({ scope: user, id: 'notion' })).toBeNull()

    const listed = await credentials.list(user)
    expect(listed).toEqual([{ id: 'github', type: 'oauth', expiresAt: 100 }])
    // `list` never returns secret values.
    expect(JSON.stringify(listed)).not.toContain('secret')

    await credentials.delete({ scope: user, id: 'github' })
    expect(await credentials.get({ scope: user, id: 'github' })).toBeNull()
    expect(await credentials.list(user)).toEqual([])
  })

  it("reads the user's own credential before the tenant's", async () => {
    const credentials = memoryCredentialStore()
    await credentials.set({
      scope: tenant,
      id: 'openai',
      credential: { type: 'api_key', value: 'sk-tenant' },
    })
    expect(await readCredential(credentials, user, 'openai')).toEqual({
      type: 'api_key',
      value: 'sk-tenant',
    })
    await credentials.set({
      scope: user,
      id: 'openai',
      credential: { type: 'api_key', value: 'sk-ann' },
    })
    expect(await readCredential(credentials, user, 'openai')).toEqual({
      type: 'api_key',
      value: 'sk-ann',
    })
  })

  it("does not read another tenant's credential", async () => {
    const credentials = memoryCredentialStore()
    await credentials.set({
      scope: tenant,
      id: 'openai',
      credential: { type: 'api_key', value: 'sk-tenant' },
    })
    const other = { tenantId: 'other', userId: 'ann' }
    expect(await readCredential(credentials, other, 'openai')).toBeNull()
  })

  it('does not give a user without a tenant the shared bucket', async () => {
    const credentials = memoryCredentialStore()
    // Saved with neither a user nor a tenant: the bucket everyone shares.
    await credentials.set({
      scope: {},
      id: 'openai',
      credential: { type: 'api_key', value: 'sk-shared' },
    })
    const solo = { userId: 'ann' }
    expect(await readCredential(credentials, solo, 'openai')).toBeNull()
  })

  it('gives saved api keys to storedProviderKeys, and skips oauth', async () => {
    const credentials = memoryCredentialStore()
    await credentials.set({
      scope: user,
      id: 'openai',
      credential: { type: 'api_key', value: 'sk-ann' },
    })
    await credentials.set({
      scope: user,
      id: 'github',
      credential: { type: 'oauth', accessToken: 'gho-token' },
    })
    const keys = storedProviderKeys(credentials, user)
    expect(await keys.get('openai')).toBe('sk-ann')
    expect(await keys.get('github')).toBeNull()
    await expect(keys.require('github')).rejects.toBeInstanceOf(
      ByokMissingError,
    )
  })
})
