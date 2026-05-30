import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveBedrockAuth, withBedrockDefaults } from '../src/utils/client'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('withBedrockDefaults', () => {
  it('builds the runtime URL by default', () => {
    const out = withBedrockDefaults({ apiKey: 'k', region: 'us-east-1' })
    expect(out.baseURL).toBe(
      'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1',
    )
  })

  it('defaults region to us-east-1', () => {
    const out = withBedrockDefaults({ apiKey: 'k' })
    expect(out.baseURL).toBe(
      'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1',
    )
  })

  it('builds the mantle URL when endpoint is mantle', () => {
    const out = withBedrockDefaults({
      apiKey: 'k',
      region: 'eu-west-1',
      endpoint: 'mantle',
    })
    expect(out.baseURL).toBe('https://bedrock-mantle.eu-west-1.api.aws/v1')
  })

  it('forces mantle when the `forced` arg is mantle, ignoring config.endpoint', () => {
    const out = withBedrockDefaults(
      { apiKey: 'k', region: 'us-west-2', endpoint: 'runtime' },
      'mantle',
    )
    expect(out.baseURL).toBe('https://bedrock-mantle.us-west-2.api.aws/v1')
  })

  it('honors an explicit baseURL override', () => {
    const out = withBedrockDefaults({
      apiKey: 'k',
      baseURL: 'http://127.0.0.1:4010/v1',
    })
    expect(out.baseURL).toBe('http://127.0.0.1:4010/v1')
  })

  it('does not leak region/endpoint/auth into the OpenAI ClientOptions', () => {
    const out = withBedrockDefaults({
      apiKey: 'k',
      region: 'us-east-1',
      endpoint: 'runtime',
      auth: 'apikey',
    })
    expect('region' in out).toBe(false)
    expect('endpoint' in out).toBe(false)
    expect('auth' in out).toBe(false)
  })

  it('explicit baseURL survives the SigV4 path and signer is attached', () => {
    const out = withBedrockDefaults({
      baseURL: 'http://127.0.0.1:4010/v1',
      auth: 'sigv4',
      region: 'us-east-1',
    })
    expect(out.baseURL).toBe('http://127.0.0.1:4010/v1')
    expect(typeof out.fetch).toBe('function')
  })

  it('user-supplied fetch wins over the SigV4 signer', () => {
    const userFetch: NonNullable<
      import('openai').ClientOptions['fetch']
    > = async () => new Response()
    const out = withBedrockDefaults({
      auth: 'sigv4',
      region: 'us-east-1',
      fetch: userFetch,
    })
    expect(out.fetch).toBe(userFetch)
  })
})

describe('resolveBedrockAuth', () => {
  it('uses an explicit apiKey', () => {
    const r = resolveBedrockAuth({ apiKey: 'explicit' }, 'runtime')
    expect(r).toEqual({ apiKey: 'explicit' })
  })

  it('falls back to BEDROCK_API_KEY', () => {
    vi.stubEnv('BEDROCK_API_KEY', 'from-bedrock-env')
    const r = resolveBedrockAuth({}, 'runtime')
    expect(r).toEqual({ apiKey: 'from-bedrock-env' })
  })

  it('falls back to AWS_BEARER_TOKEN_BEDROCK', () => {
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', 'from-aws-env')
    const r = resolveBedrockAuth({}, 'runtime')
    expect(r).toEqual({ apiKey: 'from-aws-env' })
  })

  it("auth: 'apikey' with no key throws an actionable error", () => {
    vi.stubEnv('BEDROCK_API_KEY', '')
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', '')
    expect(() =>
      resolveBedrockAuth({ auth: 'apikey' }, 'runtime'),
    ).toThrowError(/BEDROCK_API_KEY/)
  })

  it("auth: 'sigv4' returns a signing fetch and a placeholder apiKey", () => {
    const r = resolveBedrockAuth(
      { auth: 'sigv4', region: 'us-east-1' },
      'runtime',
    )
    expect(typeof r.fetch).toBe('function')
    expect(r.apiKey.length).toBeGreaterThan(0)
  })

  it("'auto' with no key falls through to SigV4", () => {
    vi.stubEnv('BEDROCK_API_KEY', '')
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', '')
    const r = resolveBedrockAuth({ region: 'us-east-1' }, 'runtime')
    expect(typeof r.fetch).toBe('function')
  })
})
