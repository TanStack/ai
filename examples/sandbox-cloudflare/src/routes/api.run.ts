import { createFileRoute } from '@tanstack/react-router'
import { toServerSentEventsStream } from '@tanstack/ai'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type { StartRunInput } from '@tanstack/ai-sandbox-cloudflare/agent'

/**
 * Proxy route: bridge the browser's `useChat` SSE expectation to the sandbox
 * agent's POST-then-WebSocket run protocol — same Worker, no self-subrequest.
 *
 * The run coordinator (the `RunCoordinator` Durable Object wired by `src/server.ts`)
 * speaks:
 *
 *   1. `startRun({ threadId, messages, … })` → `{ runId }` (returns immediately;
 *      the DO drives the run in the background under its own `ctx.waitUntil`).
 *   2. `fetch('/runs/:runId/stream?threadId=…')` over a **WebSocket** → a resumable
 *      tail of `{ seq, chunk }` events, each `chunk` a standard chat `StreamChunk`,
 *      terminated by a `{ type: 'status', record }` frame.
 *
 * `useChat` only speaks "POST a body, read back an SSE stream of StreamChunks", so
 * this handler does the handshake + WS tail and re-emits the chunks as SSE.
 *
 * IMPORTANT — why we talk to the DO directly instead of `fetch('/runs')`:
 * the agent's HTTP surface (`POST /runs`, `/runs/:id/stream`) lives in THIS SAME
 * Worker. A Worker `fetch()` to its own hostname is a same-zone self-subrequest,
 * which Cloudflare blocks in production (`error code 1042` → a 404) unless the
 * `global_fetch_strictly_public` flag is set — even though it resolves fine in the
 * local `workerd` dev runtime. So rather than loop back over HTTP, we address the
 * coordinator DO over its binding (an in-process RPC + a DO `fetch`, the exact same
 * hops the agent Worker would make) — no public round-trip, no 1042.
 */

interface ProxyBody {
  // `Array.isArray` in `parseBody` narrows to `any[]`, so the chat engine's own
  // message validation (in `startRun`) is what actually checks shape; we only
  // assert "non-empty array" here for a fast, clear 400 on garbage input.
  messages: Array<ModelMessage>
  threadId?: string
  /** The UI's chosen harness, forwarded to the agent as `metadata.harness`. */
  harness?: string
}

/**
 * The layers `useChat` may nest forwarded props in (top level, `data`, or
 * `forwardedProps`) depending on the connection adapter.
 */
function bodyLayers(value: object): Array<object> {
  const layers: Array<object> = [value]
  if (
    'data' in value &&
    value.data !== null &&
    typeof value.data === 'object'
  ) {
    layers.push(value.data)
  }
  if (
    'forwardedProps' in value &&
    value.forwardedProps !== null &&
    typeof value.forwardedProps === 'object'
  ) {
    layers.push(value.forwardedProps)
  }
  return layers
}

/** First non-empty `threadId` string across the body layers. */
function readThreadId(value: object): string | undefined {
  for (const layer of bodyLayers(value)) {
    if (
      'threadId' in layer &&
      typeof layer.threadId === 'string' &&
      layer.threadId !== ''
    ) {
      return layer.threadId
    }
  }
  return undefined
}

/** First non-empty `harness` string across the body layers. */
function readHarness(value: object): string | undefined {
  for (const layer of bodyLayers(value)) {
    if (
      'harness' in layer &&
      typeof layer.harness === 'string' &&
      layer.harness !== ''
    ) {
      return layer.harness
    }
  }
  return undefined
}

function parseBody(value: unknown): ProxyBody {
  if (value === null || typeof value !== 'object' || !('messages' in value)) {
    throw new Error('body.messages is required')
  }
  const { messages } = value
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('body.messages must be a non-empty array')
  }
  return {
    messages,
    threadId: readThreadId(value),
    harness: readHarness(value),
  }
}

/** The run coordinator DO for a thread, addressed over the `RUN_COORDINATOR` binding. */
async function getCoordinator(threadId: string) {
  // Dynamic import keeps the Workers-only `cloudflare:workers` virtual module out
  // of the client bundle (this handler only ever runs on the server).
  const { env } = await import('cloudflare:workers')
  return env.RUN_COORDINATOR.get(env.RUN_COORDINATOR.idFromName(threadId))
}

type Coordinator = Awaited<ReturnType<typeof getCoordinator>>

/** Trigger a run on the coordinator; resolve once it has a `runId`. */
async function triggerRun(
  coordinator: Coordinator,
  input: StartRunInput,
): Promise<string> {
  const { runId } = await coordinator.startRun(input)
  return runId
}

/**
 * Open the run's WebSocket tail (the coordinator's `fetch` returns a `101` with a
 * `webSocket`) and yield each chat `StreamChunk` as it arrives. Resolves when the
 * coordinator sends its terminal `status` frame (or the socket closes / the client
 * disconnects).
 */
async function* tailRun(
  coordinator: Coordinator,
  runId: string,
  threadId: string,
  signal: AbortSignal,
): AsyncGenerator<StreamChunk> {
  // The host is irrelevant — the DO routes on the pathname; this is an in-process
  // DO `fetch`, not a public request.
  const streamUrl = `https://do/runs/${runId}/stream?threadId=${encodeURIComponent(threadId)}&lastSeq=-1`
  const res = await coordinator.fetch(streamUrl, {
    headers: { Upgrade: 'websocket' },
  })
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

  socket.addEventListener('message', (event: MessageEvent) => {
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

        const threadId = body.threadId ?? crypto.randomUUID()

        const abortController = new AbortController()
        request.signal.addEventListener('abort', () => abortController.abort())

        try {
          const coordinator = await getCoordinator(threadId)
          const runId = await triggerRun(coordinator, {
            runId: crypto.randomUUID(),
            threadId,
            messages: body.messages,
            // The host this user request arrived on — the coordinators derive the
            // container's bridge + preview hosts from it when PUBLIC_HOSTNAME /
            // PREVIEW_HOSTNAME are unset (local dev → host.docker.internal +
            // localhost). Safe to trust on Cloudflare (the edge only routes hosts
            // you own to this Worker). See resolveBridgeOrigin / resolvePreviewHost.
            publicHost: new URL(request.url).host,
            // The UI's chosen coding agent. `resolveHarness` in src/agent.ts reads
            // it; absent → the HARNESS deploy default. Omitted entirely when unset.
            metadata: body.harness ? { harness: body.harness } : undefined,
          })
          const chunks = tailRun(
            coordinator,
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
