import { vi } from 'vitest'

export function mockFetch(payload: unknown, status = 200, statusText = '') {
  return vi.fn(
    async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), {
        status,
        statusText,
        headers: { 'Content-Type': 'application/json' },
      }),
  )
}

export function searchResponse(
  results: Array<Record<string, unknown>> = [],
  sessionId = 'session_test',
) {
  return {
    search_id: 'search_test',
    session_id: sessionId,
    results,
  }
}

export function fetchCall(fetchMock: ReturnType<typeof mockFetch>, index = 0) {
  const call = fetchMock.mock.calls[index]
  const input = call?.[0]
  const init = call?.[1]

  if (input === undefined || init === undefined) {
    throw new Error('Expected fetch to receive a URL and request options.')
  }

  return {
    url: input instanceof Request ? input.url : String(input),
    init,
    body: JSON.parse(String(init.body)) as Record<string, unknown>,
  }
}
