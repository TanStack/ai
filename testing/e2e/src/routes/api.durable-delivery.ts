import { createFileRoute } from '@tanstack/react-router'
import {
  memoryStream,
  toHttpResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * A provider-free delivery-durability harness route. It streams a FIXED
 * sequence of AG-UI events through the transport helper's `durability` sink
 * (`memoryStream`), so the delivery e2e can assert disconnect→reconnect→ordered
 * resume and second-tab join deterministically, with no LLM in the loop.
 *
 * - `POST` with no offset → fresh run: produce + append the fixed sequence,
 *   tagging each event with an opaque adapter-owned offset.
 * - `POST` with `Last-Event-ID` → reconnect: replay strictly after the offset
 *   from the log (the fixed sequence is never re-produced).
 * - `GET  ?offset=-1&runId=…` → second-tab join: replay from the start.
 *
 * `?transport=ndjson` switches the wire encoding from SSE to newline-delimited
 * JSON (each durable line is an `{ id, chunk }` envelope). The durability layer
 * — logging, offsets, resume, terminalization — is identical for both.
 */
function fixedRun(threadId: string, runId: string): AsyncIterable<StreamChunk> {
  return (async function* () {
    yield {
      type: 'RUN_STARTED',
      threadId,
      runId,
      timestamp: Date.now(),
    } as StreamChunk
    for (let i = 1; i <= 5; i++) {
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
      type: 'RUN_FINISHED',
      threadId,
      runId,
      model: 'fixed',
      finishReason: 'stop',
      timestamp: Date.now(),
    } as StreamChunk
  })()
}

function durableRun(request: Request) {
  const url = new URL(request.url)
  const runId = url.searchParams.get('runId') ?? crypto.randomUUID()
  url.searchParams.set('runId', runId)
  return {
    durability: memoryStream(new Request(url, request)),
    runId,
  }
}

function withRunId(response: Response, runId: string): Response {
  response.headers.set('X-Run-Id', runId)
  return response
}

function isNdjson(request: Request): boolean {
  try {
    return new URL(request.url).searchParams.get('transport') === 'ndjson'
  } catch {
    return false
  }
}

/** Build the durable response in the requested wire encoding (SSE or NDJSON). */
function durableResponse(
  request: Request,
  runId: string,
  durability: ReturnType<typeof memoryStream>,
  batch?: number,
): Response {
  const stream = fixedRun('thread-durable', runId)
  const durabilityOption = { adapter: durability, ...(batch ? { batch } : {}) }
  return isNdjson(request)
    ? toHttpResponse(stream, { durability: durabilityOption })
    : toServerSentEventsResponse(stream, { durability: durabilityOption })
}

export const Route = createFileRoute('/api/durable-delivery')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { durability, runId } = durableRun(request)
        return withRunId(durableResponse(request, runId, durability, 2), runId)
      },
      GET: async ({ request }) => {
        const { durability, runId } = durableRun(request)
        return withRunId(durableResponse(request, runId, durability), runId)
      },
    },
  },
})
