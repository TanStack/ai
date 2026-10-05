import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  memoryStream,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import {
  memoryPersistence,
  reconstructChat,
  withPersistence,
} from '@tanstack/ai-persistence'
import type { StreamChunk } from '@tanstack/ai'

// In memory, so this page never touches the SQLite threads of /persistent-chat.
// A server restart clears it.
const persistence = memoryPersistence()

// "Slow model" on the page puts 30ms between text chunks, like a slower model,
// so the batching is easy to see by eye.
async function* slowText(
  stream: AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
  for await (const chunk of stream) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    yield chunk
  }
}

/**
 * Server-authoritative persistence with a resumable POST: the persistence
 * guide's POST plus `durability`. A reload mid-answer rejoins the run from the
 * memoryStream log, because the GET reports the thread's active run.
 */
export const Route = createFileRoute('/api/durable-persistence')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = await chatParamsFromRequestBody(await request.json())
        const stream = chat({
          adapter: openaiText('gpt-5.5'),
          messages: params.messages,
          threadId: params.threadId,
          runId: params.runId,
          ...(params.resume ? { resume: params.resume } : {}),
          middleware: [withPersistence(persistence)],
        })
        // "Old batching" on the page turns the batch wait off. A chunk then
        // waits until 32 chunks or the run end, which is how durable batching
        // worked before `batchWaitMs`.
        const oldBatching = params.forwardedProps.oldBatching === true
        const slowModel = params.forwardedProps.slowModel === true
        return toServerSentEventsResponse(
          slowModel ? slowText(stream) : stream,
          {
            durability: {
              adapter: memoryStream(request),
              ...(oldBatching ? { batchWaitMs: 2_147_483_647 } : {}),
            },
          },
        )
      },

      GET: ({ request }) => {
        // A rejoin (`?offset` / `Last-Event-ID`) replays the run's log.
        const durability = memoryStream(request)
        if (durability.resumeFrom() !== null) {
          return resumeServerSentEventsResponse({ adapter: durability })
        }
        // Otherwise return the stored thread plus a cursor to any active run.
        // Demo only: a real app checks that the session owns the thread.
        return reconstructChat(persistence, request, {
          authorize: async (threadId) => threadId.length > 0,
        })
      },
    },
  },
})
