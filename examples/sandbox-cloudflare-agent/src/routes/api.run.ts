import { createFileRoute } from '@tanstack/react-router'
import { toServerSentEventsStream } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Proxy route: bridge the browser's `useChat` SSE expectation to the sandbox
 * agent's POST-then-WebSocket run protocol — same Worker, no network hop.
 *
 * The agent (the `createCloudflareSandboxAgent()` handler, composed into this
 * Worker by `src/server.ts`) speaks:
 *
 *   1. `POST /runs { threadId, messages }` → `202 { runId }` (returns immediately;
 *      the Durable Object coordinator drives the run in the background).
 *   2. `GET /runs/:runId/stream?threadId=…` over a **WebSocket** → a resumable
 *      tail of `{ seq, chunk }` events, each `chunk` a standard chat `StreamChunk`,
 *      terminated by a `{ type: 'status', record }` frame.
 *
 * `useChat` only speaks "POST a body, read back an SSE stream of StreamChunks", so
 * this handler does the handshake + WS tail and re-emits the chunks as SSE. Both
 * subrequests target this Worker's own origin (the agent routes live at the root),
 * and — because the handler runs in `workerd`, not Node — the WebSocket tail is
 * opened with a `fetch()` Upgrade (there is no client `new WebSocket()` constructor
 * in Workers).
 */

interface ProxyBody {
  messages: Array<unknown>
  data?: { threadId?: unknown }
}

function parseBody(value: unknown): ProxyBody {
  if (value === null || typeof value !== 'object' || !('messages' in value)) {
    throw new Error('body.messages is required')
  }
  const { messages } = value
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('body.messages must be a non-empty array')
  }
  let data: { threadId?: unknown } | undefined
  if (
    'data' in value &&
    value.data !== null &&
    typeof value.data === 'object'
  ) {
    data = value.data
  }
  return { messages, data }
}

/** Trigger a run on the agent; resolve once it has a `runId`. */
async function triggerRun(
  origin: string,
  threadId: string,
  messages: Array<unknown>,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(`${origin}/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ threadId, messages }),
    signal,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`agent POST /runs failed (${res.status}): ${detail}`)
  }
  const body: unknown = await res.json()
  if (
    body === null ||
    typeof body !== 'object' ||
    !('runId' in body) ||
    typeof body.runId !== 'string'
  ) {
    throw new Error('agent POST /runs did not return a runId')
  }
  return body.runId
}

/**
 * Open the run's WebSocket tail (via a `fetch()` Upgrade, the Workers way) and
 * yield each chat `StreamChunk` as it arrives. Resolves when the coordinator sends
 * its terminal `status` frame (or the socket closes / the client disconnects).
 */
async function* tailRun(
  origin: string,
  runId: string,
  threadId: string,
  signal: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const streamUrl = `${origin}/runs/${runId}/stream?threadId=${encodeURIComponent(threadId)}`
  const res = await fetch(streamUrl, { headers: { Upgrade: 'websocket' } })
  const socket = res.webSocket
  if (!socket) {
    throw new Error(
      `agent stream did not upgrade to a WebSocket (status ${res.status})`,
    )
  }
  socket.accept()

  const queue: Array<StreamChunk> = []
  // Mutated from the socket/abort callbacks below. Held on an object (rather than
  // bare `let`s) so the generator loop's checks aren't flagged as constant.
  const state: { finished: boolean; failure: Error | null } = {
    finished: false,
    failure: null,
  }
  let wake: (() => void) | null = null
  const signalReady = () => {
    wake?.()
    wake = null
  }

  socket.addEventListener('message', (event) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(typeof event.data === 'string' ? event.data : '')
    } catch {
      return
    }
    if (parsed === null || typeof parsed !== 'object') return
    if ('type' in parsed && parsed.type === 'status') {
      state.finished = true
    } else if ('chunk' in parsed) {
      queue.push(parsed.chunk as StreamChunk)
    }
    signalReady()
  })
  socket.addEventListener('close', () => {
    state.finished = true
    signalReady()
  })
  socket.addEventListener('error', () => {
    state.failure = new Error('agent stream socket error')
    state.finished = true
    signalReady()
  })
  const onAbort = () => {
    state.finished = true
    try {
      socket.close()
    } catch {
      // already closing
    }
    signalReady()
  }
  signal.addEventListener('abort', onAbort)

  try {
    while (!state.finished || queue.length > 0) {
      const next = queue.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      await new Promise<void>((resolve) => {
        wake = resolve
      })
    }
    if (state.failure) throw state.failure
  } finally {
    signal.removeEventListener('abort', onAbort)
    try {
      socket.close()
    } catch {
      // already closed
    }
  }
}

export const Route = createFileRoute('/api/run')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        let body: ProxyBody
        try {
          body = parseBody(await request.json())
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'invalid body'
          return new Response(JSON.stringify({ error: message }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        }

        const threadId =
          typeof body.data?.threadId === 'string' && body.data.threadId !== ''
            ? body.data.threadId
            : crypto.randomUUID()
        const origin = new URL(request.url).origin

        const abortController = new AbortController()
        request.signal.addEventListener('abort', () => abortController.abort())

        try {
          const runId = await triggerRun(
            origin,
            threadId,
            body.messages,
            abortController.signal,
          )
          const chunks = tailRun(
            origin,
            runId,
            threadId,
            abortController.signal,
          )
          const sseStream = toServerSentEventsStream(chunks, abortController)
          return new Response(sseStream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          })
        } catch (error) {
          if (abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          console.error('[api/run] proxy error:', error)
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'proxy error',
            }),
            { status: 502, headers: { 'content-type': 'application/json' } },
          )
        }
      },
    },
  },
})
