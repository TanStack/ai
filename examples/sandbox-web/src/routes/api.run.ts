import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'
import { z } from 'zod'
import {
  memoryStream,
  resolveResumeRunId,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { sandboxRunDriver } from '@tanstack/ai-sandbox'
import {
  buildRunStream,
  driveRun,
  driving,
  ensureReaper,
  locks,
  runs,
} from '../run-durable'
import { missingEnv } from '../sandbox-agent'
import type { ModelMessage } from '@tanstack/ai'

/**
 * The run route, DURABLE (the journal-only tier — see
 * docs/sandbox/durable-runs):
 *
 * - `POST` starts a run. `withSandbox` gets `runs` + `durability`, so a
 *   dropped connection DETACHES the run (agent keeps working, sandbox stays
 *   up) instead of destroying it. Stop is an explicit cancel via
 *   `/api/run/cancel`.
 * - `GET` is the resume/attach handler `joinRun` calls after a reload: it
 *   replays the delivery log from the requested offset AND (via
 *   `sandboxRunDriver`) takes the detached run over — claims it, re-tails the
 *   journal, aligns against what was already delivered, and streams the rest.
 *
 * Unlike the Cloudflare example (which proxies to a Durable Object), the agent
 * loop runs right here, and every store is in-process memory: zero infra, at
 * the documented cost that log durability equals this process's lifetime.
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

/** Flatten the nested `data`/`forwardedProps` layers into one object to validate. */
function flattenRunBody(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  const flat: Record<string, unknown> = {}
  if ('messages' in value) flat.messages = value.messages
  for (const key of ['threadId', 'sessionId'] as const) {
    const found = readForwarded(value, key)
    if (found !== undefined) flat[key] = found
  }
  return flat
}

const runBodySchema = z.preprocess(
  flattenRunBody,
  z.object({
    messages: z
      .array(z.custom<ModelMessage>())
      .min(1, 'body.messages must be a non-empty array'),
    threadId: z.string().optional(),
    sessionId: z.string().optional(),
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

export const Route = createFileRoute('/api/run')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        POST: {
          middleware: [runBodyMiddleware],
          handler: ({ request, context }) => {
            ensureReaper()
            const {
              messages,
              threadId: threadIdInput,
              sessionId,
            } = context.runBody

            const missing = missingEnv()
            if (missing.length > 0) {
              return jsonError(
                500,
                `Missing required env: ${missing.join(', ')}. Set it and restart the dev server.`,
              )
            }

            const threadId = threadIdInput ?? crypto.randomUUID()
            // Forwarded from the client (`X-Run-Id`), not generated, whenever
            // possible: the journal path, the deterministic message ids, and
            // the delivery-log stream are all keyed by it, and the client can
            // only rejoin a run whose id it knows.
            const runId = resolveResumeRunId(request) ?? crypto.randomUUID()

            const abortController = new AbortController()
            // A dropped request ABORTS the stream — with `runs` + `durability`
            // wired below, `withSandbox` treats that abort as a DETACH (keeps
            // the sandbox and the agent), not a cancel. Explicit cancel is
            // /api/run/cancel, which aborts with `RUN_CANCEL_REASON`.
            request.signal.addEventListener('abort', () =>
              abortController.abort(),
            )

            try {
              driving.set(runId, abortController)

              // ONE durability adapter instance for the middleware and the
              // response, so the journal path and the delivery log describe
              // the same run. `Last-Event-ID` makes a mid-stream SSE reconnect
              // to this route resume instead of restarting.
              const adapter = memoryStream({
                runId,
                offset: request.headers.get('Last-Event-ID'),
              })

              const stream = buildRunStream({
                threadId,
                messages,
                runId,
                abortController,
                attach: false,
                durability: adapter,
                ...(sessionId !== undefined ? { sessionId } : {}),
              })

              return toServerSentEventsResponse(stream, {
                abortController,
                durability: { adapter },
              })
            } catch (error) {
              driving.delete(runId)
              if (abortController.signal.aborted) {
                return new Response(null, { status: 499 })
              }
              console.error('[api/run] error:', error)
              return jsonError(
                502,
                error instanceof Error ? error.message : 'run error',
              )
            }
          },
        },
        // The resume/attach handler `joinRun` GETs (`?offset=-1&runId=…`) after
        // a reload, and an SSE reconnect falls back to. The response replays
        // the delivery log either way; `driver` additionally claims a detached
        // run and keeps driving it (serving the log untouched when the run is
        // unknown, terminal, or claimed by another request).
        GET: {
          handler: ({ request }) => {
            ensureReaper()
            return resumeServerSentEventsResponse({
              // The raised deadline covers the sliver between a run being
              // accepted and its `run.accepted` marker landing in the log — a
              // join in that sliver parks briefly instead of failing as "run
              // gone" (the default 100ms is tuned for plain chat, where an
              // empty log really does mean the run is gone).
              adapter: memoryStream(request, { firstChunkDeadlineMs: 10_000 }),
              driver: sandboxRunDriver({
                request,
                runs,
                locks,
                durability: () => memoryStream(request),
                drive: driveRun,
              }),
            })
          },
        },
      }),
  },
})
