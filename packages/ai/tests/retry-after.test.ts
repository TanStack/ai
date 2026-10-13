import { describe, expect, it } from 'vitest'
import { toRetryAfterMs } from '../src/adapter-internals'

/** An SDK-style error that carries the headers of its response. */
const withHeaders = (headers: Record<string, string>) =>
  Object.assign(new Error('rate limited'), { headers: new Headers(headers) })

describe('toRetryAfterMs', () => {
  it('reads retry-after in seconds', () => {
    expect(toRetryAfterMs(withHeaders({ 'retry-after': '7' }))).toBe(7000)
  })

  it('reads retry-after as an HTTP date', () => {
    const date = new Date(Date.now() + 30_000).toUTCString()
    const ms = toRetryAfterMs(withHeaders({ 'retry-after': date }))
    expect(ms).toBeGreaterThan(28_000)
    expect(ms).toBeLessThanOrEqual(30_000)
  })

  it('prefers retry-after-ms over retry-after', () => {
    expect(
      toRetryAfterMs(
        withHeaders({ 'retry-after-ms': '1500', 'retry-after': '7' }),
      ),
    ).toBe(1500)
  })

  it('reads headers from a plain object', () => {
    expect(toRetryAfterMs({ headers: { 'retry-after': '2' } })).toBe(2000)
  })

  it.each([
    ['junk', { 'retry-after': 'soon' }],
    ['a negative value', { 'retry-after': '-3' }],
    ['an empty value', { 'retry-after-ms': '' }],
    ['no header', {}],
  ])('gives undefined for %s', (_, headers) => {
    expect(toRetryAfterMs(withHeaders(headers))).toBeUndefined()
  })

  it('gives undefined for an error without headers', () => {
    expect(toRetryAfterMs(new Error('boom'))).toBeUndefined()
    expect(toRetryAfterMs('boom')).toBeUndefined()
  })
})
