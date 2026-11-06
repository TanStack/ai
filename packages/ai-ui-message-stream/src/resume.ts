import { replayRunStream, toServerSentEventsResponse } from '@tanstack/ai'
import type { StreamChunk, StreamDurability } from '@tanstack/ai'
import { createUIMessageStreamResponse } from 'ai'
import { toUIMessageStream } from './stream'

/**
 * Answer the AI SDK resume request (`GET {api}/{chatId}/stream`, which
 * `useChat({ resume: true })` sends on mount). Pass the durability log of the
 * chat's active run. The run is replayed from its start, as the AI SDK
 * `DefaultChatTransport` expects. With no log, the response is the AI SDK's
 * "nothing to resume" 204.
 */
export function resumeUIMessageStreamResponse(
  durability: StreamDurability | null | undefined,
): Response {
  if (!durability) return new Response(null, { status: 204 })
  return createUIMessageStreamResponse({
    stream: toUIMessageStream(replayRunStream(durability)),
  })
}

/**
 * Serve a `chat()` run to the AI SDK `useChat` so that it can be resumed. The
 * run is written to `durability` and keeps running when the client goes away.
 * The response reads the run back from the log, the same way
 * {@link resumeUIMessageStreamResponse} does.
 */
export function toResumableUIMessageStreamResponse(
  stream: AsyncIterable<StreamChunk>,
  durability: StreamDurability,
): Response {
  // ponytail: the SSE helper owns the only exported durable producer. It
  // writes the run to the log and does not wait for a reader, so its unused
  // SSE body is drained (a cancel would mark the run as detached). Export the
  // producer from @tanstack/ai to drop the extra SSE encoding.
  void toServerSentEventsResponse(stream, {
    durability: { adapter: durability },
  })
    .body?.pipeTo(new WritableStream())
    // The log holds the RUN_ERROR for the client. This keeps it in the logs.
    .catch((error: unknown) => {
      console.error('toResumableUIMessageStreamResponse: the run failed', error)
    })
  return resumeUIMessageStreamResponse(durability)
}
