import { describe, expect, it } from 'vitest'
import {
  buildClientSecretRequest,
  parseClientSecretResponse,
} from '../src/realtime/token'

describe('buildClientSecretRequest', () => {
  it('nests session config with the required type under the `session` key', () => {
    expect(buildClientSecretRequest('gpt-realtime-mini')).toEqual({
      session: { type: 'realtime', model: 'gpt-realtime-mini' },
    })
  })
})

describe('parseClientSecretResponse', () => {
  it('reads the GA top-level value/expires_at shape and converts seconds to ms', () => {
    const token = parseClientSecretResponse(
      {
        value: 'ek_test_123',
        expires_at: 1_700_000_000,
        session: { type: 'realtime', model: 'gpt-realtime' },
      },
      'gpt-realtime-mini',
    )
    expect(token).toEqual({
      provider: 'openai',
      token: 'ek_test_123',
      expiresAt: 1_700_000_000_000,
      config: { model: 'gpt-realtime' },
    })
  })

  it('falls back to the requested model when the response omits session.model', () => {
    const token = parseClientSecretResponse(
      { value: 'ek_test_123', expires_at: 1_700_000_000 },
      'gpt-realtime-mini',
    )
    expect(token.config.model).toBe('gpt-realtime-mini')
  })

  it('throws on a missing or malformed response instead of returning a broken token', () => {
    expect(() => parseClientSecretResponse(undefined, 'gpt-realtime')).toThrow(
      /missing or malformed/,
    )
    expect(() =>
      parseClientSecretResponse({ expires_at: 1_700_000_000 }, 'gpt-realtime'),
    ).toThrow(/missing or malformed/)
    expect(() =>
      parseClientSecretResponse(
        { value: 'ek_test_123', expires_at: Number.NaN },
        'gpt-realtime',
      ),
    ).toThrow(/missing or malformed/)
  })
})
