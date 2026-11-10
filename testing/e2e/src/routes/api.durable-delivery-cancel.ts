import { createFileRoute } from '@tanstack/react-router'
import {
  RUN_CANCEL_REASON,
  chatParamsFromRequest,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Provider-free harness for the opt-in durable HTTP cancel (`cancelUrl`).
 *
 * - `POST` → a slow durable run. Its controller is kept in `liveRuns`.
 * - `POST ?op=cancel` with `{ runId }` → aborts that run with
 *   `RUN_CANCEL_REASON`, like an app's cancel route.
 * - `GET ?runId=…` → `{ ending }`: `'finished'`, the abort reason, or `null`
 *   while the run is still going.
 */
const liveRuns = new Map<string, AbortController>()
const endings = new Map<string, string>()

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

/** Ten content chunks, 100ms apart. Stops early when `signal` aborts. */
function slowRun(
  threadId: string,
  runId: string,
  signal: AbortSignal,
): AsyncIterable<StreamChunk> {
  return (async function* () {
    try {
      yield {
        type: 'RUN_STARTED',
        threadId,
        runId,
        timestamp: Date.now(),
      } as StreamChunk
      yield {
        type: 'TEXT_MESSAGE_START',
        messageId: 'm',
        role: 'assistant',
        timestamp: Date.now(),
      } as StreamChunk
      for (let i = 1; i <= 10; i++) {
        await sleep(100, signal)
        if (signal.aborted) return
        yield {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: 'm',
          model: 'fixed',
          delta: String(i),
          content: String(i),
          timestamp: Date.now(),
        } as StreamChunk
      }
      yield {
        type: 'TEXT_MESSAGE_END',
        messageId: 'm',
        timestamp: Date.now(),
      } as StreamChunk
      yield {
        type: 'RUN_FINISHED',
        threadId,
        runId,
        model: 'fixed',
        finishReason: 'stop',
        timestamp: Date.now(),
      } as StreamChunk
      endings.set(runId, 'finished')
    } finally {
      if (signal.aborted) endings.set(runId, String(signal.reason))
      liveRuns.delete(runId)
    }
  })()
}

export const Route = createFileRoute('/api/durable-delivery-cancel')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        if (url.searchParams.get('op') === 'cancel') {
          const body: unknown = await request.json()
          if (typeof body !== 'object' || body === null || !('runId' in body)) {
            return new Response('runId is required', { status: 400 })
          }
          const runId = body.runId
          if (typeof runId !== 'string') {
            return new Response('runId must be a string', { status: 400 })
          }
          liveRuns.get(runId)?.abort(RUN_CANCEL_REASON)
          return new Response(null, { status: 204 })
        }

        const { threadId, runId } = await chatParamsFromRequest(request)
        const abortController = new AbortController()
        liveRuns.set(runId, abortController)
        // memoryStream keys the log by `?runId`.
        url.searchParams.set('runId', runId)
        return toServerSentEventsResponse(
          slowRun(threadId, runId, abortController.signal),
          {
            abortController,
            durability: {
              adapter: memoryStream(
                new Request(url, { headers: request.headers }),
              ),
            },
          },
        )
      },
      GET: ({ request }) => {
        const runId = new URL(request.url).searchParams.get('runId') ?? ''
        return Response.json({ ending: endings.get(runId) ?? null })
      },
    },
  },
})
