import { createFileRoute } from '@tanstack/react-router'
import {
  memoryStream,
  summarize,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import {
  reconstructGeneration,
  withGenerationPersistence,
} from '@tanstack/ai-persistence'
import { openaiSummarize } from '@tanstack/ai-openai'
import { replayGenerationIfResuming } from '../lib/generation-durability'
import { generationServerPersistence } from '../lib/generation-server-store'

/**
 * Text summarization with DELIVERY durability, so a mid-run reload rejoins and
 * tails the stream to completion — the same resumability the media routes get.
 *
 * Summarize produces text, not media, so there are no artifacts to store: the
 * run record alone is enough for `persistence: true` to repaint the last summary
 * after a reload, and `reconstructGeneration` serves it from the GET below.
 *
 * A *mid-run* reload additionally needs the delivery log:
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

        // Persistence needs the scope named. Reject a request without one
        // rather than filing the run somewhere no client could hydrate by.
        if (!threadId) {
          return new Response(
            '`threadId` is required — it is the scope this summary is filed under.',
            { status: 400 },
          )
        }

        const stream = summarize({
          adapter: openaiSummarize(model ?? 'gpt-5.5'),
          text,
          maxLength,
          style,
          stream: true,
          ...(runId ? { runId } : {}),
          threadId,
          // Writes the run record. Summarize has no media, so no artifact
          // stores are needed — the record alone is what mount hydration
          // repaints the last summary from.
          middleware: [
            withGenerationPersistence(generationServerPersistence()),
          ],
        })

        // Delivery durability: chunks are logged and id-tagged, so a mount-time
        // `joinRun` replays/tails instead of failing. The producer is decoupled
        // from this response by the library, so a reload keeps it draining to
        // the log until the summary finishes.
        return toServerSentEventsResponse(stream, {
          durability: { adapter: memoryStream(request) },
        })
      },

      // Two jobs, resolved in order:
      // 1. `joinRun` delivery replay, when the request carries a resume offset.
      // 2. Mount hydration for `persistence: true`: the latest run for
      //    `?threadId=`, so a finished summary restores after a reload even
      //    once its delivery log has aged out.
      GET: async ({ request }) =>
        replayGenerationIfResuming(request) ??
        (await reconstructGeneration(generationServerPersistence(), request)),
    },
  },
})
