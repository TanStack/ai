import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'
import { toServerSentEventsStream } from '@tanstack/ai'
import { z } from 'zod'
import {
  isGrokModel,
  isGrokProtocol,
  isGrokTransport,
  isHarness,
} from '../sandbox-options'
import type {
  GrokBuildModel,
  GrokBuildProtocol,
  GrokTransport,
  HarnessName,
} from '../sandbox-options'
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

/** The layers `useChat` may nest forwarded props in, depending on the adapter. */
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

/** First non-empty string for `key` across any body layer (top layer wins). */
function readForwarded(value: object, key: string): string | undefined {
  for (const layer of bodyLayers(value)) {
    const candidate: unknown = Reflect.get(layer, key)
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  return undefined
}

const FORWARDED_KEYS = [
  'threadId',
  'harness',
  'grokModel',
  'grokProtocol',
  'grokTransport',
] as const

/** Flatten the nested `data`/`forwardedProps` layers into one object to validate. */
function flattenRunBody(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  const flat: Record<string, unknown> = {}
  if ('messages' in value) flat.messages = value.messages
  for (const key of FORWARDED_KEYS) {
    const found = readForwarded(value, key)
    if (found !== undefined) flat[key] = found
  }
  return flat
}

/**
 * Validates the proxy body. Harness/grok fields reuse the same type guards as the
 * picker UI (`sandbox-options.ts`). Harness is optional — absent values fall back
 * to the deploy-time `HARNESS` var in `resolveHarness`.
 */
const runBodySchema = z.preprocess(
  flattenRunBody,
  z.object({
    messages: z
      .array(z.custom<ModelMessage>())
      .min(1, 'body.messages must be a non-empty array'),
    threadId: z.string().optional(),
    harness: z.custom<HarnessName>(isHarness, 'Unknown harness').optional(),
    grokModel: z
      .custom<GrokBuildModel>(isGrokModel, 'Unknown grokModel')
      .optional(),
    grokProtocol: z
      .custom<GrokBuildProtocol>(isGrokProtocol, 'Unknown grokProtocol')
      .optional(),
    grokTransport: z
      .custom<GrokTransport>(isGrokTransport, 'Unknown grokTransport')
      .optional(),
  }),
)

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Request middleware: parse + validate the body once and hand the typed result
 * to the POST handler via context, short-circuiting with a 4xx on a bad request
 * so the handler only ever sees a valid `runBody`.
 */
const runBodyMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    if (request.signal.aborted) {
      return new Response(null, { status: 499 })
    }
    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return jsonError(400, 'invalid JSON body')
    }
    const parsed = runBodySchema.safeParse(raw)
    if (!parsed.success) {
      return jsonError(400, parsed.error.issues[0]?.message ?? 'invalid body')
    }
    return next({ context: { runBody: parsed.data } })
  },
)

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
    handlers: ({ createHandlers }) =>
      createHandlers({
        POST: {
          middleware: [runBodyMiddleware],
          handler: async ({ request, context }) => {
            const {
              messages,
              threadId: threadIdInput,
              harness,
              grokModel,
              grokProtocol,
              grokTransport,
            } = context.runBody

            const threadId = threadIdInput ?? crypto.randomUUID()

            const abortController = new AbortController()
            request.signal.addEventListener('abort', () =>
              abortController.abort(),
            )

            try {
              const coordinator = await getCoordinator(threadId)
              const runId = await triggerRun(coordinator, {
                runId: crypto.randomUUID(),
                threadId,
                messages,
                // The host this user request arrived on — the coordinators derive the
                // container's bridge + preview hosts from it when PUBLIC_HOSTNAME /
                // PREVIEW_HOSTNAME are unset (local dev → host.docker.internal +
                // localhost). Safe to trust on Cloudflare (the edge only routes hosts
                // you own to this Worker). See resolveBridgeOrigin / resolvePreviewHost.
                publicHost: new URL(request.url).host,
                // The UI's chosen coding agent. `resolveHarness` in src/agent.ts reads
                // it; absent → the HARNESS deploy default. Omitted entirely when unset.
                metadata:
                  harness || grokModel || grokProtocol || grokTransport
                    ? {
                        ...(harness ? { harness } : {}),
                        ...(grokModel ? { grokModel } : {}),
                        ...(grokProtocol ? { grokProtocol } : {}),
                        ...(grokTransport ? { grokTransport } : {}),
                      }
                    : undefined,
              })
              const chunks = tailRun(
                coordinator,
                runId,
                threadId,
                abortController.signal,
              )
              const sseStream = toServerSentEventsStream(
                chunks,
                abortController,
              )
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
              return jsonError(
                502,
                error instanceof Error ? error.message : 'proxy error',
              )
            }
          },
        },
      }),
  },
})
