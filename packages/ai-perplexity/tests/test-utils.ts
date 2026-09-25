import { vi } from 'vitest'

export function mockFetch(payload: unknown, status = 200, statusText = '') {
  return vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
    return new Response(JSON.stringify(payload), {
      status,
      statusText,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

export function firstFetchCall(fetchMock: ReturnType<typeof mockFetch>): {
  url: string
  init: RequestInit
} {
  const call = fetchMock.mock.calls[0]
  const input = call?.[0]
  const init = call?.[1]
  if (input === undefined || init === undefined) {
    throw new Error('expected fetch to be called with a URL and RequestInit')
  }
  return {
    url: typeof input === 'string' ? input : String(input),
    init,
  }
}

export function firstFetchBody(
  fetchMock: ReturnType<typeof mockFetch>,
): Record<string, unknown> {
  return JSON.parse(String(firstFetchCall(fetchMock).init.body)) as Record<
    string,
    unknown
  >
}

export function firstFetchHeaders(
  fetchMock: ReturnType<typeof mockFetch>,
): Record<string, string> {
  const headers = firstFetchCall(fetchMock).init.headers
  if (!headers || Array.isArray(headers) || headers instanceof Headers) {
    throw new Error('expected fetch headers as a record')
  }
  return headers
}
