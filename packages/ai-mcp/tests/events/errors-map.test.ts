import { describe, expect, it } from 'vitest'
import { ProtocolError } from '@modelcontextprotocol/client'
import { MCPEventRequestError } from '../../src/errors'
import { toMCPEventRequestError } from '../../src/events/errors-map'

describe('toMCPEventRequestError', () => {
  it('maps -32023 to kind not-found', () => {
    const err = toMCPEventRequestError(new ProtocolError(-32023, 'missing'))
    expect(err).toBeInstanceOf(MCPEventRequestError)
    expect(err).toMatchObject({ code: -32023, kind: 'not-found' })
  })

  it('maps -32027 with data.reason challenge_failed', () => {
    const err = toMCPEventRequestError(
      new ProtocolError(-32027, 'callback failed', {
        reason: 'challenge_failed',
      }),
    )
    expect(err).toBeInstanceOf(MCPEventRequestError)
    expect(err).toMatchObject({
      kind: 'callback-endpoint',
      reason: 'challenge_failed',
    })
  })

  it.each([
    [-32602, 'invalid-params'],
    [-32023, 'not-found'],
    [-32024, 'forbidden'],
    [-32025, 'resource-exhausted'],
    [-32026, 'unsupported'],
    [-32027, 'callback-endpoint'],
    [-32015, 'unknown'],
    [-32011, 'unknown'],
  ] as const)('maps %i to kind %s', (code, kind) => {
    const err = toMCPEventRequestError(new ProtocolError(code, 'failed'))
    expect(err).toBeInstanceOf(MCPEventRequestError)
    expect(err).toMatchObject({ code, kind })
  })

  it('passes a non-ProtocolError through', () => {
    const original = new Error('nope')
    expect(toMCPEventRequestError(original)).toBe(original)
  })

  it('never includes data.secret in the message', () => {
    const secret = 'whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
    const err = toMCPEventRequestError(
      new ProtocolError(-32602, `bad secret ${secret}`, { secret }),
    )
    expect(err).toBeInstanceOf(MCPEventRequestError)
    if (!(err instanceof MCPEventRequestError))
      throw new Error('expected mapped error')
    expect(err.message).not.toContain(secret)
    expect(JSON.stringify(err.data)).not.toContain(secret)
  })
})
