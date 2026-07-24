import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  memoryStream,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

/**
 * Resumable-streams demo endpoint.
 *
 * The `memoryStream(request)` durability sink records every chunk to an ordered
 * log before delivery and tags each SSE event with an opaque `id:` offset, so a
 * dropped connection reconnects (`Last-Event-ID`) and resumes from the log
 * without re-running the model. The `useChat` client on /resumable needs no
 * extra code for this; it just uses this route's connection.
 *
 * `memoryStream` is process-local, which is fine for a single-process demo. In
 * production, swap it for `durableStream(request, { server })` from
 * `@tanstack/ai-durable-stream` backed by Cloudflare Durable Streams, Electric,
 * or any Durable Streams protocol server.
 */

export const Route = createFileRoute('/api/resumable')({
  server: {
    handlers: {
      // Fresh run (no `Last-Event-ID`) → produce with the model and append to
      // the log. Reconnect (client re-sends with `Last-Event-ID`) → the sink
      // replays strictly after that offset and the lazy `chat()` stream below
      // is never iterated.
      POST: async ({ request }) => {
        const abortController = new AbortController()
        const params = await chatParamsFromRequestBody(await request.json())

        const stream = chat({
          adapter: openaiText('gpt-5.5'),
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

      // Replay a run from the start (`?offset=-1&runId=…`) for an explicit
      // `joinRun` (a second tab or a full reload). Read-only: no messages are
      // sent and no model is called. This demo relies on automatic POST
      // reconnect and does not call joinRun, but a durable route should expose
      // this so an attach-by-id resume is possible.
      GET: ({ request }) => {
        return resumeServerSentEventsResponse({
          adapter: memoryStream(request),
        })
      },
    },
  },
})
