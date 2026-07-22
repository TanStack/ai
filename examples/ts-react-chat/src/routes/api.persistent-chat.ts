import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  memoryStream,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

/**
 * Persistent-chat demo endpoint.
 *
 * Two kinds of durability stack here:
 *
 * 1. STATE (this file) — `withChatPersistence` middleware writes the thread
 *    transcript, run records, and interrupt state to SQLite. The store survives
 *    a full server restart, so a reload can continue the same conversation from
 *    the server's own copy even if the client sent no history.
 *
 * 2. DELIVERY — `memoryStream(request)` records each chunk to an ordered log and
 *    tags each SSE event with an `id:` offset, so a dropped connection reconnects
 *    (`Last-Event-ID`) and resumes without re-running the model. Swap it for
 *    `durableStream(request, { server })` from `@tanstack/ai-durable-stream` in
 *    production (memoryStream is process-local).
 */

// One SQLite-backed store for the whole process. `migrate: true` applies the
// bundled TanStack AI schema on first open. `.data/` is gitignored.
const persistence = sqlitePersistence({
  url: './.data/persistent-chat.db',
  migrate: true,
})

export const Route = createFileRoute('/api/persistent-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const abortController = new AbortController()
        const params = await chatParamsFromRequestBody(await request.json())

        const stream = chat({
          adapter: openaiText('gpt-5.5'),
          // `withChatPersistence` loads the stored transcript when `messages` is
          // empty and overwrites it (authoritative-history contract) on finish.
          middleware: [withChatPersistence(persistence)],
          agentLoopStrategy: maxIterations(10),
          messages: params.messages,
          threadId: params.threadId,
          runId: params.runId,
          abortController,
        })

        return toServerSentEventsResponse(stream, {
          durability: { adapter: memoryStream(request) },
          abortController,
        })
      },

      // Replay a run from the start (`?offset=-1&runId=…`) so a full reload can
      // re-attach to an in-flight run by id. Read-only: no model call.
      GET: ({ request }) => {
        return resumeServerSentEventsResponse({
          adapter: memoryStream(request),
        })
      },
    },
  },
})
