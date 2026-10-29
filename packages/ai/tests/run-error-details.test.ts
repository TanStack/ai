import { describe, expect, it } from 'vitest'
import { toRunErrorDetails } from '../src/adapter-internals'

/**
 * Built like `@anthropic-ai/sdk` builds its `APIError`: `type` from the
 * body's `error.type`, `requestID` from the `request-id` header, and the
 * whole body on `error`.
 */
function anthropicError(errorType: string, requestId: string) {
  const headers = new Headers({ 'request-id': requestId })
  return Object.assign(new Error('529 Overloaded'), {
    status: 529,
    headers,
    requestID: headers.get('request-id'),
    error: { type: 'error', error: { type: errorType, message: 'Overloaded' } },
    type: errorType,
  })
}

/**
 * Built like `openai` builds its `APIError`: the body's `error` object on
 * `error`, its `type` on `type`, and `requestID` from `x-request-id`.
 */
function openaiError(errorType: string, requestId: string) {
  const headers = new Headers({ 'x-request-id': requestId })
  const body = { message: 'Rate limit reached', type: errorType }
  return Object.assign(new Error('429 Rate limit reached'), {
    status: 429,
    headers,
    requestID: headers.get('x-request-id'),
    error: body,
    type: body.type,
  })
}

describe('toRunErrorDetails', () => {
  it('reads the Anthropic error type and request id', () => {
    expect(
      toRunErrorDetails(anthropicError('overloaded_error', 'req_011')),
    ).toEqual({ errorType: 'overloaded_error', requestId: 'req_011' })
  })

  it('reads an Anthropic stream error, which has no `type` of its own', () => {
    // The SDK throws `new APIError(undefined, body, undefined, headers)` on a
    // stream `error` event, so `type` is null and the body is the envelope.
    const error = Object.assign(new Error('Overloaded'), {
      type: null,
      headers: new Headers({ 'request-id': 'req_012' }),
      error: {
        type: 'error',
        error: { type: 'overloaded_error', message: 'Overloaded' },
      },
    })
    expect(toRunErrorDetails(error)).toEqual({
      errorType: 'overloaded_error',
      requestId: 'req_012',
    })
  })

  it('reads the OpenAI error type and x-request-id', () => {
    expect(
      toRunErrorDetails(openaiError('rate_limit_exceeded', 'req_abc')),
    ).toEqual({ errorType: 'rate_limit_exceeded', requestId: 'req_abc' })
  })

  it('reads a request_id field and a plain header object', () => {
    expect(toRunErrorDetails({ request_id: 'req_1' })).toEqual({
      requestId: 'req_1',
    })
    expect(toRunErrorDetails({ headers: { 'x-request-id': 'req_2' } })).toEqual(
      { requestId: 'req_2' },
    )
  })

  it('drops a value that is not a short string', () => {
    expect(toRunErrorDetails({ type: 'x'.repeat(500) })).toEqual({})
    expect(toRunErrorDetails({ type: 42, requestID: {} })).toEqual({})
  })

  it('gives an empty object when nothing is present', () => {
    expect(toRunErrorDetails(new Error('boom'))).toEqual({})
    expect(toRunErrorDetails('boom')).toEqual({})
    expect(toRunErrorDetails(undefined)).toEqual({})
  })
})
