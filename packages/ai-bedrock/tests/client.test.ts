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
  it('uses an explicit apiKey — returns bearer', () => {
    const r = resolveBedrockAuth({ apiKey: 'explicit' }, 'runtime')
    expect(r).toEqual({ kind: 'bearer', token: 'explicit' })
  })

  it('falls back to BEDROCK_API_KEY — returns bearer', () => {
    vi.stubEnv('BEDROCK_API_KEY', 'from-bedrock-env')
    const r = resolveBedrockAuth({}, 'runtime')
    expect(r).toEqual({ kind: 'bearer', token: 'from-bedrock-env' })
  })

  it('falls back to AWS_BEARER_TOKEN_BEDROCK — returns bearer', () => {
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', 'from-aws-env')
    const r = resolveBedrockAuth({}, 'runtime')
    expect(r).toEqual({ kind: 'bearer', token: 'from-aws-env' })
  })

  it('resolves precedence apiKey > BEDROCK_API_KEY > AWS_BEARER_TOKEN_BEDROCK', () => {
    vi.stubEnv('BEDROCK_API_KEY', 'bedrock-env')
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', 'aws-env')
    // Explicit apiKey wins over both env vars.
    expect(resolveBedrockAuth({ apiKey: 'explicit' }, 'runtime')).toEqual({
      kind: 'bearer',
      token: 'explicit',
    })
    // With no apiKey, BEDROCK_API_KEY wins over AWS_BEARER_TOKEN_BEDROCK.
    expect(resolveBedrockAuth({}, 'runtime')).toEqual({
      kind: 'bearer',
      token: 'bedrock-env',
    })
  })

  it('treats a present-but-blank BEDROCK_API_KEY as absent', () => {
    vi.stubEnv('BEDROCK_API_KEY', '   ')
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', 'aws-env')
    expect(resolveBedrockAuth({}, 'runtime')).toEqual({
      kind: 'bearer',
      token: 'aws-env',
    })
  })

  it("uses service 'bedrock-mantle' for the mantle endpoint under sigv4", () => {
    const r = resolveBedrockAuth(
      { auth: 'sigv4', region: 'us-west-2' },
      'mantle',
    )
    expect(r.kind).toBe('sigv4')
    if (r.kind === 'sigv4') {
      expect(r.region).toBe('us-west-2')
      expect(r.service).toBe('bedrock-mantle')
    }
  })

  it("auth: 'apikey' with no key throws an actionable error", () => {
    vi.stubEnv('BEDROCK_API_KEY', '')
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', '')
    expect(() =>
      resolveBedrockAuth({ auth: 'apikey' }, 'runtime'),
    ).toThrowError(/No Bedrock API key/)
  })

  it("auth: 'sigv4' returns kind:'sigv4' with region and service", () => {
    const r = resolveBedrockAuth(
      { auth: 'sigv4', region: 'us-east-1' },
      'runtime',
    )
    expect(r.kind).toBe('sigv4')
    if (r.kind === 'sigv4') {
      expect(r.region).toBe('us-east-1')
      expect(r.service).toBe('bedrock')
    }
  })

  it("'auto' with no key falls through to SigV4 — returns kind:'sigv4'", () => {
    vi.stubEnv('BEDROCK_API_KEY', '')
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', '')
    const r = resolveBedrockAuth({ region: 'us-east-1' }, 'runtime')
    expect(r.kind).toBe('sigv4')
  })
})
