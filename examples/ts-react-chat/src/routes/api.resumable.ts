import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Resumable-streams demo endpoint.
 *
 * The `memoryStream(request)` durability sink records every chunk to an ordered
 * log before delivery and tags each SSE event with an opaque `id:` offset, so a
 * client can reconnect (`Last-Event-ID`) or a second tab can join (`?offset=-1`)
 * without re-running the model.
 *
 * `memoryStream` is process-local — fine for a single-process demo. In
 * production, swap it for `durableStream(request, { server })` from
 * `@tanstack/ai-durable-stream` backed by Cloudflare Durable Streams, Electric,
 * or any Durable Streams protocol server.
 */

// A join/replay never iterates the provider stream — the durability log is the
// source of truth — so the GET handler passes this placeholder.
const REPLAY_ONLY_STREAM: AsyncIterable<StreamChunk> = {
  async *[Symbol.asyncIterator]() {
    // intentionally empty
  },
}

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

      // Join an in-flight or finished run from the start (`?offset=-1&runId=…`),
      // replaying the ordered log. Read-only — no messages are sent.
      GET: ({ request }) => {
        return toServerSentEventsResponse(REPLAY_ONLY_STREAM, {
          durability: { adapter: memoryStream(request) },
        })
      },
    },
  },
})
