import { describe, expect, it } from 'vitest'
import { resolveBedrockAuth } from '../src/utils/auth'

describe('resolveBedrockAuth', () => {
  it('returns bearer when an explicit apiKey is given', () => {
    const r = resolveBedrockAuth({ apiKey: 'k', region: 'us-east-1' }, 'runtime')
    expect(r).toEqual({ kind: 'bearer', token: 'k' })
  })

  it('returns bearer from BEDROCK_API_KEY env', () => {
    process.env.BEDROCK_API_KEY = 'envkey'
    try {
      const r = resolveBedrockAuth({ region: 'us-east-1' }, 'runtime')
      expect(r).toEqual({ kind: 'bearer', token: 'envkey' })
    } finally {
      delete process.env.BEDROCK_API_KEY
    }
  })

  it('returns sigv4 with service+region when auth forced sigv4', () => {
    const r = resolveBedrockAuth({ auth: 'sigv4', region: 'us-west-2' }, 'mantle')
    expect(r.kind).toBe('sigv4')
    if (r.kind === 'sigv4') {
      expect(r.region).toBe('us-west-2')
      expect(r.service).toBe('bedrock-mantle')
    }
  })

  it('throws in apikey mode with no key available', () => {
    delete process.env.BEDROCK_API_KEY
    delete process.env.AWS_BEARER_TOKEN_BEDROCK
    expect(() => resolveBedrockAuth({ auth: 'apikey' }, 'runtime')).toThrow(
      /No Bedrock API key/,
    )
  })
})
