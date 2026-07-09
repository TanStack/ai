import { createFileRoute } from '@tanstack/react-router'
import { memoryStream, toServerSentEventsResponse } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * A provider-free delivery-durability harness route. It streams a FIXED
 * sequence of AG-UI events through the transport helper's `durability` sink
 * (`memoryStream`), so the delivery e2e can assert disconnect→reconnect→ordered
 * resume and second-tab join deterministically, with no LLM in the loop.
 *
 * - `POST` with no offset → fresh run: produce + append the fixed sequence,
 *   tagging each SSE event with an `id: runId@seq` offset.
 * - `POST` with `Last-Event-ID` → reconnect: replay strictly after the offset
 *   from the log (the fixed sequence is never re-produced).
 * - `GET  ?offset=-1&runId=…` → second-tab join: replay from the start.
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

export const Route = createFileRoute('/api/durable-delivery')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const durability = memoryStream(request)
        const runId = durability.runId()
        return toServerSentEventsResponse(fixedRun('thread-durable', runId), {
          durability: { adapter: durability, batch: 2 },
        })
      },
      GET: async ({ request }) => {
        const durability = memoryStream(request)
        const runId = durability.runId()
        return toServerSentEventsResponse(fixedRun('thread-durable', runId), {
          durability: { adapter: durability },
        })
      },
    },
  },
})
