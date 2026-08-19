import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getVercelGatewayApiKeyFromEnv,
  withVercelGatewayDefaults,
} from '../src/utils/client'

describe('getVercelGatewayApiKeyFromEnv', () => {
  afterEach(() => {
    delete process.env.AI_GATEWAY_API_KEY
    delete process.env.VERCEL_OIDC_TOKEN
    vi.unstubAllEnvs()
  })

  it('prefers AI_GATEWAY_API_KEY over VERCEL_OIDC_TOKEN', () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gw_key')
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc_token')

    expect(getVercelGatewayApiKeyFromEnv()).toBe('gw_key')
  })

  it('falls back to VERCEL_OIDC_TOKEN when AI_GATEWAY_API_KEY is unset', () => {
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc_token')

    expect(getVercelGatewayApiKeyFromEnv()).toBe('oidc_token')
  })

  it('throws when neither env var is set', () => {
    delete process.env.AI_GATEWAY_API_KEY
    delete process.env.VERCEL_OIDC_TOKEN

    expect(() => getVercelGatewayApiKeyFromEnv()).toThrow(
      /AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN/,
    )
  })
})

describe('withVercelGatewayDefaults', () => {
  afterEach(() => {
    delete process.env.AI_GATEWAY_API_KEY
    delete process.env.VERCEL_OIDC_TOKEN
    vi.unstubAllEnvs()
  })

  it('sets the default gateway baseURL', () => {
    expect(withVercelGatewayDefaults({ apiKey: 'k' })).toMatchObject({
      apiKey: 'k',
      baseURL: 'https://ai-gateway.vercel.sh/v1',
    })
  })

  it('keeps an explicit baseURL', () => {
    expect(
      withVercelGatewayDefaults({
        apiKey: 'k',
        baseURL: 'http://127.0.0.1:4010/v1',
      }),
    ).toMatchObject({
      apiKey: 'k',
      baseURL: 'http://127.0.0.1:4010/v1',
    })
  })

  it('maps httpReferer and xTitle onto defaultHeaders', () => {
    const result = withVercelGatewayDefaults({
      apiKey: 'k',
      httpReferer: 'https://example.com',
      xTitle: 'My App',
    })

    expect(result.defaultHeaders).toMatchObject({
      'http-referer': 'https://example.com',
      'x-title': 'My App',
    })
    expect(result).not.toHaveProperty('httpReferer')
    expect(result).not.toHaveProperty('xTitle')
  })
})
