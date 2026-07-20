import { expect, test } from '@playwright/test'

/**
 * Delivery durability (transport layer) over a real WebSocket.
 *
 * Mirrors `delivery-durability.spec.ts` (SSE/NDJSON) but exercises the WS arm
 * of the same provider-free harness: `api.durable-delivery-ws` streams the
 * same fixed AG-UI sequence (`fixedRun`) through the same `memoryStream`
 * durability sink, so join/reconnect assertions stay deterministic. See
 * `testing/e2e/src/lib/durable-delivery-ws-plugin.ts` for the server side —
 * the Vite/Nitro dev server runs on plain Node (no `WebSocketPair`), so the
 * plugin hooks the underlying http server's `upgrade` event directly and
 * drives `toWebSocketStream`/`resumeWebSocketStream` over a `ws` socket.
 *
 * Exempt from the aimock policy: this harness streams a fixed sequence and
 * never reaches an LLM provider's HTTP layer, so there is nothing to mock.
 */

const FIXED_TYPES = [
  'RUN_STARTED',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_CONTENT',
  'RUN_FINISHED',
]

function runInput(runId: string): Record<string, unknown> {
  return {
    threadId: 'thread-durable',
    runId,
    messages: [],
    tools: [],
    context: [],
    forwardedProps: {},
    state: {},
  }
}

test.describe('delivery durability (websocket)', () => {
  test('streams the fixed run in order over a single connection', async ({
    page,
  }) => {
    await page.goto('/')

    const result = await page.evaluate(
      async ({ runId, input }) => {
        const wsUrl = `${location.origin.replace(/^http/, 'ws')}/api/durable-delivery-ws?runId=${encodeURIComponent(runId)}`
        const ws = new WebSocket(wsUrl)
        await new Promise<void>((resolve, reject) => {
          ws.onopen = () => resolve()
          ws.onerror = () => reject(new Error('ws open failed'))
        })

        const received: Array<{ type: string; id?: string }> = []
        const done = new Promise<void>((resolve) => {
          ws.onmessage = (e) => {
            const frame = JSON.parse(e.data as string) as {
              type?: string
              id?: string
              chunk?: { type: string }
            }
            const chunk = frame.chunk ?? (frame as { type: string })
            if (chunk.type === 'ping') return
            received.push({ type: chunk.type, id: frame.id })
            if (chunk.type === 'RUN_FINISHED') resolve()
          }
        })
        ws.send(JSON.stringify(input))
        await done
        ws.close()
        return received
      },
      { runId: 'e2e-ws-1', input: runInput('e2e-ws-1') },
    )

    expect(result.map((r) => r.type)).toEqual(FIXED_TYPES)
    // Durable frames are tagged with an opaque offset id.
    expect(result.every((r) => typeof r.id === 'string')).toBeTruthy()
  })

  test('reconnect with ?offset resumes the remainder exactly once, in order', async ({
    page,
  }) => {
    await page.goto('/')

    const result = await page.evaluate(
      async ({ runId, input }) => {
        const base = `${location.origin.replace(/^http/, 'ws')}/api/durable-delivery-ws`

        // First connection: read only the first two chunks, then disconnect.
        const first = new WebSocket(`${base}?runId=${encodeURIComponent(runId)}`)
        await new Promise<void>((resolve, reject) => {
          first.onopen = () => resolve()
          first.onerror = () => reject(new Error('ws open failed'))
        })

        const firstChunks: Array<{ type: string; id?: string }> = []
        const gotTwo = new Promise<void>((resolve) => {
          first.onmessage = (e) => {
            const frame = JSON.parse(e.data as string) as {
              id?: string
              chunk?: { type: string }
              type?: string
            }
            const chunk = frame.chunk ?? (frame as { type: string })
            if (chunk.type === 'ping') return
            firstChunks.push({ type: chunk.type, id: frame.id })
            if (firstChunks.length === 2) resolve()
          }
        })
        first.send(JSON.stringify(input))
        await gotTwo
        first.close()
        // Let the close propagate server-side before reconnecting.
        await new Promise((r) => setTimeout(r, 50))

        const lastId = firstChunks[1]!.id!

        // Second connection: resume from the last acknowledged offset.
        const second = new WebSocket(
          `${base}?runId=${encodeURIComponent(runId)}&offset=${encodeURIComponent(lastId)}`,
        )
        await new Promise<void>((resolve, reject) => {
          second.onopen = () => resolve()
          second.onerror = () => reject(new Error('ws reopen failed'))
        })

        const resumedChunks: Array<{ type: string; id?: string }> = []
        const finished = new Promise<void>((resolve) => {
          second.onmessage = (e) => {
            const frame = JSON.parse(e.data as string) as {
              id?: string
              chunk?: { type: string }
              type?: string
            }
            const chunk = frame.chunk ?? (frame as { type: string })
            if (chunk.type === 'ping') return
            resumedChunks.push({ type: chunk.type, id: frame.id })
            if (chunk.type === 'RUN_FINISHED') resolve()
          }
        })
        await finished
        second.close()

        return { firstChunks, resumedChunks, lastId }
      },
      { runId: 'e2e-ws-2', input: runInput('e2e-ws-2') },
    )

    // First connection saw RUN_STARTED + the first content delta.
    expect(result.firstChunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'TEXT_MESSAGE_CONTENT',
    ])

    // Resume delivers exactly the remaining 4 content deltas + RUN_FINISHED,
    // in order, with no duplicates of anything already delivered.
    expect(result.resumedChunks.map((c) => c.type)).toEqual([
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
      'RUN_FINISHED',
    ])
    const resumedIds = result.resumedChunks.map((c) => c.id)
    expect(resumedIds).not.toContain(result.lastId)
    expect(new Set(resumedIds).size).toBe(resumedIds.length)
  })
})
