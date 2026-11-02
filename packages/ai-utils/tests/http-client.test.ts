import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHttpClient } from '../src/http/client'
import type { FetchLike, HttpClientOptions } from '../src/http/client'

class TestAPIError extends Error {
  constructor(
    readonly status: number | undefined,
    readonly body: unknown,
    readonly rawMessage: string | undefined,
    readonly headers: Headers | undefined,
  ) {
    super(`status ${status}`)
  }
}

type Step = Response | Error | 'hang'

/**
 * A fetch that answers each call with the next step. 'hang' waits until the
 * request signal aborts, then rejects with an AbortError like real fetch.
 */
function fakeFetch(...steps: Array<Step>) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init })
    const step = steps[calls.length - 1]
    if (step === undefined) throw new Error(`unexpected call ${calls.length}`)
    if (step === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        )
      })
    }
    if (step instanceof Error) throw step
    return step
  }
  return { fetch, calls }
}

function makeClient(
  fetch: FetchLike,
  overrides: Partial<HttpClientOptions> = {},
) {
  return createHttpClient({
    baseURL: 'https://api.test/v1',
    fetch,
    makeError: (status, body, message, headers) =>
      new TestAPIError(status, body, message, headers),
    ...overrides,
  })
}

const status = (code: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { message: `code ${code}` } }), {
    status: code,
    headers,
  })

const ok = () => new Response('{"ok":true}', { status: 200 })

/** Starts a request and settles it to the response or the thrown error. */
const settle = (promise: Promise<Response>) =>
  promise.then(
    (response) => ({ response, error: undefined }),
    (error: unknown) => ({ response: undefined, error }),
  )

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createHttpClient request building', () => {
  it('sends a JSON body with merged headers and query to the custom fetch', async () => {
    const { fetch, calls } = fakeFetch(ok())
    const client = makeClient(fetch, {
      headers: { authorization: 'Bearer k', 'x-api-key': 'k', 'x-keep': '1' },
      defaultQuery: { 'api-version': '2024-10-21' },
    })

    const response = await client.request({
      method: 'post',
      path: '/chat/completions',
      query: { include: ['a', 'b'], filter: { kind: 'x' }, skip: undefined },
      headers: { 'X-Api-Key': null, 'x-extra': '2' },
      body: { model: 'm', stream: true },
    })

    expect(await response.json()).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
    const url = calls[0]?.url
    const init = calls[0]?.init ?? {}
    expect(url).toBe(
      'https://api.test/v1/chat/completions?api-version=2024-10-21&include%5B%5D=a&include%5B%5D=b&filter%5Bkind%5D=x',
    )
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"model":"m","stream":true}')
    const headers = new Headers(init.headers)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('authorization')).toBe('Bearer k')
    expect(headers.get('x-keep')).toBe('1')
    expect(headers.get('x-extra')).toBe('2')
    expect(headers.has('x-api-key')).toBe(false)
    expect(
      [...headers.keys()].some((name) => name.startsWith('x-stainless')),
    ).toBe(false)
  })

  it('sends a FormData body as it is, without a JSON content type', async () => {
    const { fetch, calls } = fakeFetch(ok())
    const form = new FormData()
    form.append('model', 'whisper-1')
    await makeClient(fetch).request({
      method: 'POST',
      path: 'audio',
      body: form,
    })
    expect(calls[0]?.init.body).toBe(form)
    expect(new Headers(calls[0]?.init.headers).has('content-type')).toBe(false)
  })
})

describe('createHttpClient retries', () => {
  it.each([408, 409, 429, 500, 503])('retries a %i response', async (code) => {
    const { fetch, calls } = fakeFetch(
      status(code, { 'retry-after-ms': '0' }),
      ok(),
    )
    const response = await makeClient(fetch).request({
      method: 'GET',
      path: '/m',
    })
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(2)
  })

  it('does not retry a 400 and passes status, body, and headers to makeError', async () => {
    const { fetch, calls } = fakeFetch(status(400, { 'x-request-id': 'req_1' }))
    const { error } = await settle(
      makeClient(fetch).request({ method: 'GET', path: '/m' }),
    )
    expect(calls).toHaveLength(1)
    expect(error).toBeInstanceOf(TestAPIError)
    if (!(error instanceof TestAPIError)) return
    expect(error.status).toBe(400)
    expect(error.body).toEqual({ error: { message: 'code 400' } })
    expect(error.rawMessage).toBeUndefined()
    expect(error.headers?.get('x-request-id')).toBe('req_1')
  })

  it('passes a non-JSON error body to makeError as the message', async () => {
    const { fetch } = fakeFetch(
      new Response('<html>Bad Gateway</html>', { status: 404 }),
    )
    const { error } = await settle(
      makeClient(fetch).request({ method: 'GET', path: '/m' }),
    )
    expect(error).toBeInstanceOf(TestAPIError)
    if (!(error instanceof TestAPIError)) return
    expect(error.body).toBeUndefined()
    expect(error.rawMessage).toBe('<html>Bad Gateway</html>')
  })

  it('obeys x-should-retry over the status', async () => {
    const noRetry = fakeFetch(status(500, { 'x-should-retry': 'false' }))
    await settle(
      makeClient(noRetry.fetch).request({ method: 'GET', path: '/m' }),
    )
    expect(noRetry.calls).toHaveLength(1)

    const retry = fakeFetch(
      status(400, { 'x-should-retry': 'true', 'retry-after-ms': '0' }),
      ok(),
    )
    await makeClient(retry.fetch).request({ method: 'GET', path: '/m' })
    expect(retry.calls).toHaveLength(2)
  })

  it('makes one attempt when maxRetries is 0', async () => {
    const { fetch, calls } = fakeFetch(status(500))
    const { error } = await settle(
      makeClient(fetch, { maxRetries: 0 }).request({
        method: 'GET',
        path: '/m',
      }),
    )
    expect(error).toBeInstanceOf(TestAPIError)
    expect(calls).toHaveLength(1)
  })

  it.each([
    ['retry-after-ms', { 'retry-after-ms': '2000' }, 2000],
    ['retry-after seconds', { 'retry-after': '3' }, 3000],
    [
      'retry-after HTTP date',
      { 'retry-after': 'Thu, 01 Jan 2026 00:00:05 GMT' },
      5000,
    ],
  ])('waits for %s before the retry', async (_label, headers, waitMs) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { fetch, calls } = fakeFetch(status(429, headers), ok())
    const result = settle(
      makeClient(fetch).request({ method: 'GET', path: '/m' }),
    )

    await vi.advanceTimersByTimeAsync(waitMs - 1)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toHaveLength(2)
    expect((await result).response?.status).toBe(200)
  })

  it('obeys a retry-after over 60 seconds when maxRetryAfterMs allows it', async () => {
    vi.useFakeTimers()
    const { fetch, calls } = fakeFetch(
      status(429, { 'retry-after': '120' }),
      ok(),
    )
    const result = settle(
      makeClient(fetch, { maxRetryAfterMs: 2 ** 31 - 1 }).request({
        method: 'GET',
        path: '/m',
      }),
    )

    await vi.advanceTimersByTimeAsync(119_999)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toHaveLength(2)
    expect((await result).response?.status).toBe(200)
  })

  it('uses exponential backoff when retry-after is over 60 seconds', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { fetch, calls } = fakeFetch(
      status(500, { 'retry-after': '120' }),
      status(500),
      status(500),
    )
    const result = settle(
      makeClient(fetch).request({ method: 'GET', path: '/m' }),
    )

    await vi.advanceTimersByTimeAsync(499)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(999)
    expect(calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toHaveLength(3)
    expect((await result).error).toBeInstanceOf(TestAPIError)
  })

  it('retries a connection error, then throws APIConnectionError with the cause', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const cause = new TypeError('fetch failed')
    const { fetch, calls } = fakeFetch(cause, cause)
    const result = settle(
      makeClient(fetch, { maxRetries: 1 }).request({
        method: 'GET',
        path: '/m',
      }),
    )
    await vi.advanceTimersByTimeAsync(500)
    const { error } = await result
    expect(calls).toHaveLength(2)
    expect(error).toBeInstanceOf(Error)
    if (!(error instanceof Error)) return
    expect(error.name).toBe('APIConnectionError')
    expect(error.cause).toBe(cause)
  })

  it('does not retry a ReadableStream body', async () => {
    const { fetch, calls } = fakeFetch(status(500))
    await settle(
      makeClient(fetch).request({
        method: 'POST',
        path: '/upload',
        body: new ReadableStream(),
      }),
    )
    expect(calls).toHaveLength(1)
  })
})

describe('createHttpClient timeout and abort', () => {
  it('times out each attempt, retries, then throws APIConnectionTimeoutError', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { fetch, calls } = fakeFetch('hang', 'hang')
    const result = settle(
      makeClient(fetch, { timeout: 100, maxRetries: 1 }).request({
        method: 'GET',
        path: '/m',
      }),
    )

    await vi.advanceTimersByTimeAsync(100)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(500 + 100)
    expect(calls).toHaveLength(2)
    const { error } = await result
    expect(error).toBeInstanceOf(Error)
    if (!(error instanceof Error)) return
    expect(error.name).toBe('APIConnectionTimeoutError')
  })

  it('throws APIUserAbortError and does not retry when the caller aborts', async () => {
    const { fetch, calls } = fakeFetch('hang', ok())
    const controller = new AbortController()
    const result = settle(
      makeClient(fetch).request({
        method: 'GET',
        path: '/m',
        signal: controller.signal,
      }),
    )
    controller.abort()
    const { error } = await result
    expect(calls).toHaveLength(1)
    expect(error).toBeInstanceOf(Error)
    if (!(error instanceof Error)) return
    expect(error.name).toBe('APIUserAbortError')
  })

  it('stops a retry wait when the caller aborts', async () => {
    const { fetch, calls } = fakeFetch(
      status(429, { 'retry-after': '30' }),
      ok(),
    )
    const controller = new AbortController()
    const result = settle(
      makeClient(fetch, {
        makeAbortError: () => new Error('custom abort'),
      }).request({
        method: 'GET',
        path: '/m',
        signal: controller.signal,
      }),
    )
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    controller.abort()
    const { error } = await result
    expect(calls).toHaveLength(1)
    expect(error).toEqual(new Error('custom abort'))
  })
})
