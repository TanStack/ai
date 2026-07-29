import { createFileRoute } from '@tanstack/react-router'
import {
  memoryStream,
  summarize,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiSummarize } from '@tanstack/ai-openai'
import { replayGenerationIfResuming } from '../lib/generation-durability'

/**
 * Text summarization with DELIVERY durability, so a mid-run reload rejoins and
 * tails the stream to completion — the same resumability the media routes get.
 *
 * Summarize is not a generation "kind" (no media artifacts to persist), so this
 * page drives its STATE persistence from the client (`generationPersistence`
 * localStorage) — the finished summary restores from there on a done-refresh.
 * The only server-side piece needed for a *mid-run* reload is the delivery log:
 * `memoryStream` records the chunks, and the run's `runId` is threaded into
 * `summarize()` so the emitted `RUN_STARTED` is keyed by the same id the client
 * rejoins with. Without that alignment the client's `joinRun` GET would tail a
 * different (empty) log and fast-fail.
 */
export const Route = createFileRoute('/api/summarize')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { text, maxLength, style, model } = body.data
        // The AG-UI envelope carries the run identity alongside `data`. It also
        // rides the `X-Run-Id` header (which `memoryStream` keys the log by), so
        // threading `runId` into `summarize()` keeps RUN_STARTED and the log in
        // sync.
        const threadId =
          typeof body.threadId === 'string' ? body.threadId : undefined
        const runId = typeof body.runId === 'string' ? body.runId : undefined

        const stream = summarize({
          adapter: openaiSummarize(model ?? 'gpt-5.5'),
          text,
          maxLength,
          style,
          stream: true,
          ...(runId ? { runId } : {}),
          ...(threadId ? { threadId } : {}),
        })

        // Delivery durability: chunks are logged and id-tagged, so a mount-time
        // `joinRun` replays/tails instead of failing. The producer is decoupled
        // from this response by the library, so a reload keeps it draining to
        // the log until the summary finishes.
        return toServerSentEventsResponse(stream, {
          durability: { adapter: memoryStream(request) },
        })
      },

      // `joinRun` replay — re-attach to a summarize run still in flight from a
      // previous request. 404 when the run is unknown or its log has aged out,
      // rather than the SPA shell the client cannot parse as SSE.
      GET: ({ request }) =>
        replayGenerationIfResuming(request) ??
        new Response('no resumable run', { status: 404 }),
    },
  },
})
