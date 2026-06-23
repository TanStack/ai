import { createFileRoute } from '@tanstack/react-router'
import { toServerSentEventsStream } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Proxy route: bridge the browser's `useChat` SSE expectation to the Cloudflare
 * sandbox coding agent's POST-then-WebSocket run protocol.
 *
 * The agent (a `createCloudflareSandboxAgent()` Worker, e.g.
 * `examples/sandbox-cloudflare-agent` run with `wrangler dev`) speaks:
 *
 *   1. `POST /runs { threadId, messages }` → `202 { runId }` (returns immediately;
 *      the Durable Object coordinator drives the run in the background).
 *   2. `GET /runs/:runId/stream?threadId=…` over a **WebSocket** → a resumable
 *      tail of `{ seq, chunk }` events, each `chunk` a standard chat
 *      `StreamChunk`, terminated by a `{ type: 'status', record }` frame.
 *
 * `useChat` only speaks "POST a body, read back an SSE stream of StreamChunks".
 * This handler does the handshake + WS tail server-side and re-emits the chunks
 * as SSE, so the React page is identical to every other demo in this app.
 *
 * Point it at your agent with `SANDBOX_AGENT_URL` (defaults to the local
 * `wrangler dev` address).
 */

const AGENT_URL = process.env.SANDBOX_AGENT_URL ?? 'http://localhost:8787'

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

/** Trigger a run on the agent Worker; resolve once it has a `runId`. */
async function triggerRun(
  threadId: string,
  messages: Array<unknown>,
  signal: AbortSignal,
): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${AGENT_URL}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ threadId, messages }),
      signal,
    })
  } catch (cause) {
    // The most common failure in local dev: the agent Worker isn't running.
    throw new Error(
      `Could not reach the sandbox agent at ${AGENT_URL}. Start it with ` +
        `\`pnpm --filter @tanstack/sandbox-cloudflare-agent-example dev\` ` +
        `(or set SANDBOX_AGENT_URL).`,
      { cause },
    )
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`agent POST /runs failed (${res.status}): ${detail}`)
  }
  const body: unknown = await res.json()
  if (
    body === null ||
    typeof body !== 'object' ||
    typeof (body as { runId?: unknown }).runId !== 'string'
  ) {
    throw new Error('agent POST /runs did not return a runId')
  }
  return (body as { runId: string }).runId
}

/**
 * Open the run's WebSocket tail and yield each chat `StreamChunk` as it arrives.
 * Resolves when the coordinator sends its terminal `status` frame (or the socket
 * closes / the client disconnects).
 */
async function* tailRun(
  runId: string,
  threadId: string,
  signal: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const wsUrl = `${AGENT_URL.replace(/^http/, 'ws')}/runs/${runId}/stream?threadId=${encodeURIComponent(threadId)}`
  const socket = new WebSocket(wsUrl)

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

export const Route = createFileRoute(
  '/_sandbox-agent/api/sandbox-agent' as any,
)({
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

        const abortController = new AbortController()
        request.signal.addEventListener('abort', () => abortController.abort())

        try {
          const runId = await triggerRun(
            threadId,
            body.messages,
            abortController.signal,
          )
          const chunks = tailRun(runId, threadId, abortController.signal)
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
          console.error('[api/sandbox-agent] proxy error:', error)
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
