import { createFileRoute } from '@tanstack/react-router'
import { createHarnessClient } from '@tanstack/ai-harness/client'

/**
 * `createHarnessClient` over HTTP against `/api/harness-protocol`, on a new
 * thread. The thread has no entry yet, so `events()` gets `404` and waits to
 * connect again. Its waits are longer than the test. Then the client sends
 * the first message. The route returns the `events()` statuses and the text
 * that the stream got in 10 s.
 *
 * The request's `authorization`, `x-test-id`, and `x-aimock-port` headers go
 * to `/api/harness-protocol`, so its model answers from the aimock fixture.
 */
async function firstTurn(request: Request) {
  const forwarded = ['authorization', 'x-test-id', 'x-aimock-port']
  const headers = Object.fromEntries(
    forwarded.flatMap((name) => {
      const value = request.headers.get(name)
      return value === null ? [] : [[name, value]]
    }),
  )
  const statuses: Array<number> = []
  const client = createHarnessClient({
    url: `${new URL(request.url).origin}/api/harness-protocol`,
    threadId: `client-events-${headers['x-test-id'] ?? 'default'}`,
    headers,
    fetch: async (input, init) => {
      const response = await fetch(input, init)
      if (String(input).includes('/events?')) statuses.push(response.status)
      return response
    },
    reconnectDelayMs: 60_000,
  })
  const reader = new AbortController()
  let text = ''
  const reading = (async () => {
    for await (const { event } of client.events({ signal: reader.signal })) {
      if (event.type === 'TEXT_MESSAGE_CONTENT') text += event.delta
    }
  })()
  try {
    await waitUntil(() => statuses.length > 0)
    await client.send('[harness-protocol] hello')
    await waitUntil(() => text === 'Hello over the harness protocol.')
    return { statuses, text }
  } finally {
    reader.abort()
    await reading.catch(() => {})
  }
}

/** Wait until `check` is true, for up to 10 s. */
async function waitUntil(check: () => boolean) {
  const deadline = Date.now() + 10_000
  while (!check()) {
    if (Date.now() > deadline) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

export const Route = createFileRoute('/api/harness-client-events')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return Response.json(await firstTurn(request))
        } catch (error) {
          return Response.json({
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    },
  },
})
