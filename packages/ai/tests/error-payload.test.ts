import { describe, expect, it } from 'vitest'
import {
  toRunErrorPayload,
  toRunErrorRawEvent,
} from '../src/activities/error-payload'

describe('toRunErrorPayload', () => {
  it('narrows an Error instance, extracting message and code', () => {
    const err = Object.assign(new Error('boom'), { code: 'E_BOOM' })
    expect(toRunErrorPayload(err)).toEqual({
      message: 'boom',
      code: 'E_BOOM',
    })
  })

  it('falls back when an Error has no message', () => {
    const err = new Error('')
    expect(toRunErrorPayload(err)).toEqual({
      message: 'Unknown error occurred',
      code: undefined,
    })
  })

  it('uses the supplied fallback when provided', () => {
    expect(toRunErrorPayload(new Error(''), 'Generation failed')).toEqual({
      message: 'Generation failed',
      code: undefined,
    })
  })

  it('narrows plain objects with string message + code fields', () => {
    expect(toRunErrorPayload({ message: 'rate-limited', code: '429' })).toEqual(
      {
        message: 'rate-limited',
        code: '429',
      },
    )
  })

  it('coerces numeric code fields to strings', () => {
    expect(toRunErrorPayload({ message: 'x', code: 500 })).toEqual({
      message: 'x',
      code: '500',
    })
  })

  it('coerces numeric code fields on Error instances too', () => {
    const err = Object.assign(new Error('http 429'), { code: 429 })
    expect(toRunErrorPayload(err)).toEqual({
      message: 'http 429',
      code: '429',
    })
  })

  it('ignores non-finite or otherwise non-string/non-number codes', () => {
    expect(toRunErrorPayload({ message: 'nan', code: Number.NaN })).toEqual({
      message: 'nan',
      code: undefined,
    })
    expect(toRunErrorPayload({ message: 'sym', code: Symbol('x') })).toEqual({
      message: 'sym',
      code: undefined,
    })
  })

  it('falls back to a numeric `status` when there is no `code`', () => {
    // Google's `@google/genai` `ApiError` reports the HTTP status on
    // `status: number` and carries no `code`; without the fallback the status
    // is lost and the failure cannot be classified downstream.
    const err = Object.assign(new Error('http 403'), { status: 403 })
    expect(toRunErrorPayload(err)).toEqual({
      message: 'http 403',
      code: '403',
    })
    expect(toRunErrorPayload({ message: 'http 429', status: 429 })).toEqual({
      message: 'http 429',
      code: '429',
    })
  })

  it('prefers an explicit `code` over `status`', () => {
    const err = Object.assign(new Error('conflict'), {
      code: 'rate_limit_exceeded',
      status: 429,
    })
    expect(toRunErrorPayload(err)).toEqual({
      message: 'conflict',
      code: 'rate_limit_exceeded',
    })
  })

  it('ignores a non-numeric `status` (reason phrase, not an HTTP code)', () => {
    // A string `status` is typically an HTTP reason phrase ("Forbidden") or a
    // symbolic status ("PERMISSION_DENIED"), not the numeric code consumers key
    // on, so it must not be forwarded as `code`.
    expect(
      toRunErrorPayload({ message: 'denied', status: 'Forbidden' }),
    ).toEqual({
      message: 'denied',
      code: undefined,
    })
    expect(
      toRunErrorPayload({ message: 'denied', status: 'PERMISSION_DENIED' }),
    ).toEqual({
      message: 'denied',
      code: undefined,
    })
  })

  it('reproduces the @google/genai ApiError shape (status-only, JSON message)', () => {
    // Mirrors `class ApiError extends Error { status: number }` from
    // `@google/genai`, whose message is the stringified provider body.
    const body = JSON.stringify({
      error: {
        code: 403,
        message: 'Your project has been denied access. Please contact support.',
        status: 'PERMISSION_DENIED',
      },
    })
    const err = Object.assign(new Error(body), { name: 'ApiError', status: 403 })
    expect(toRunErrorPayload(err)).toEqual({
      message: body,
      code: '403',
    })
  })

  it('accepts a bare string as a thrown value', () => {
    expect(toRunErrorPayload('plain string error')).toEqual({
      message: 'plain string error',
      code: undefined,
    })
  })

  it('returns the fallback for null / undefined / numbers / empty strings', () => {
    for (const value of [null, undefined, 42, false, '']) {
      expect(toRunErrorPayload(value, 'default')).toEqual({
        message: 'default',
        code: undefined,
      })
    }
  })

  it('does not leak extra properties from the original error', () => {
    const err = Object.assign(new Error('leaky'), {
      request: { headers: { authorization: 'Bearer secret' } },
    })
    const payload = toRunErrorPayload(err)
    expect(payload).toEqual({ message: 'leaky', code: undefined })
    expect(payload).not.toHaveProperty('request')
  })

  describe('abort normalization', () => {
    it('normalizes DOM AbortError to code: aborted', () => {
      const err = new Error('The operation was aborted')
      err.name = 'AbortError'
      expect(toRunErrorPayload(err)).toEqual({
        message: 'Request aborted',
        code: 'aborted',
      })
    })

    it('normalizes OpenAI APIUserAbortError', () => {
      const err = new Error('Request was aborted.')
      err.name = 'APIUserAbortError'
      expect(toRunErrorPayload(err)).toEqual({
        message: 'Request aborted',
        code: 'aborted',
      })
    })

    it('normalizes OpenRouter RequestAbortedError', () => {
      const err = new Error('Request aborted by client: AbortError: ...')
      err.name = 'RequestAbortedError'
      expect(toRunErrorPayload(err)).toEqual({
        message: 'Request aborted',
        code: 'aborted',
      })
    })

    it('normalizes abort-named plain objects (non-Error throws)', () => {
      const obj = { name: 'AbortError', message: 'whatever' }
      expect(toRunErrorPayload(obj)).toEqual({
        message: 'Request aborted',
        code: 'aborted',
      })
    })

    it('does not normalize errors with similar-looking names', () => {
      const err = Object.assign(new Error('hi'), { name: 'NotAbortError' })
      expect(toRunErrorPayload(err)).toEqual({
        message: 'hi',
        code: undefined,
      })
    })
  })
})

describe('toRunErrorRawEvent', () => {
  it('forwards an explicit `rawEvent` attached to the error', () => {
    const providerBody = { provider_name: 'anthropic', raw: { foo: 'bar' } }
    const err = Object.assign(new Error('Provider returned error'), {
      code: 502,
      rawEvent: providerBody,
    })
    expect(toRunErrorRawEvent(err)).toBe(providerBody)
  })

  it("forwards an SDK APIError's object-valued `error` response body", () => {
    const body = { type: 'rate_limit_error', message: 'slow down', code: 429 }
    const err = Object.assign(new Error('429'), { status: 429, error: body })
    expect(toRunErrorRawEvent(err)).toBe(body)
  })

  it('forwards `metadata` when no richer body is present', () => {
    const metadata = { provider_name: 'openai', raw: 'overloaded' }
    expect(toRunErrorRawEvent({ message: 'boom', metadata })).toBe(metadata)
  })

  it('prefers `rawEvent` over `error` over `metadata`', () => {
    const raw = { winner: true }
    const err = {
      rawEvent: raw,
      error: { loser: true },
      metadata: { loser: true },
    }
    expect(toRunErrorRawEvent(err)).toBe(raw)
  })

  it('ignores a string-valued `error` field (not a structured body)', () => {
    expect(toRunErrorRawEvent({ message: 'x', error: 'just a string' })).toBe(
      undefined,
    )
  })

  it('returns undefined for plain errors, strings, and nullish values', () => {
    expect(toRunErrorRawEvent(new Error('plain'))).toBe(undefined)
    expect(toRunErrorRawEvent('string error')).toBe(undefined)
    expect(toRunErrorRawEvent(null)).toBe(undefined)
    expect(toRunErrorRawEvent(undefined)).toBe(undefined)
  })

  it('never returns the raw exception object itself (no header leakage)', () => {
    const err = Object.assign(new Error('leaky'), {
      request: { headers: { authorization: 'Bearer secret' } },
    })
    const raw = toRunErrorRawEvent(err)
    expect(raw).toBe(undefined)
    expect(raw).not.toBe(err)
  })
})
