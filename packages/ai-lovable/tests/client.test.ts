import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getLovableApiKeyFromEnv,
  lovableGatewayHeaders,
  withLovableDefaults,
  LOVABLE_DEFAULT_BASE_URL,
} from '../src/utils/client'

describe('getLovableApiKeyFromEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads LOVABLE_API_KEY', () => {
    vi.stubEnv('LOVABLE_API_KEY', 'lv_key')

    expect(getLovableApiKeyFromEnv()).toBe('lv_key')
  })

  it('throws when LOVABLE_API_KEY is unset', () => {
    expect(() => getLovableApiKeyFromEnv()).toThrow(/LOVABLE_API_KEY/)
  })
})

describe('lovableGatewayHeaders', () => {
  it('returns the gateway auth headers', () => {
    expect(lovableGatewayHeaders('k')).toEqual({
      'Lovable-API-Key': 'k',
      'X-Lovable-AIG-SDK': 'tanstack-ai',
    })
  })
})

describe('withLovableDefaults', () => {
  it('sets the default gateway baseURL and auth headers', () => {
    expect(withLovableDefaults({ apiKey: 'k' })).toMatchObject({
      apiKey: 'k',
      baseURL: LOVABLE_DEFAULT_BASE_URL,
      defaultHeaders: {
        'Lovable-API-Key': 'k',
        'X-Lovable-AIG-SDK': 'tanstack-ai',
      },
    })
  })

  it('keeps an explicit baseURL', () => {
    expect(
      withLovableDefaults({
        apiKey: 'k',
        baseURL: 'http://127.0.0.1:4010/v1',
      }),
    ).toMatchObject({
      apiKey: 'k',
      baseURL: 'http://127.0.0.1:4010/v1',
    })
  })

  it('lets caller defaultHeaders override SDK identification', () => {
    const result = withLovableDefaults({
      apiKey: 'k',
      defaultHeaders: { 'X-Lovable-AIG-SDK': 'custom' },
    })

    expect(result.defaultHeaders).toMatchObject({
      'Lovable-API-Key': 'k',
      'X-Lovable-AIG-SDK': 'custom',
    })
  })
})
