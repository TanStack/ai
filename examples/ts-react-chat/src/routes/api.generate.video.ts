import { createFileRoute } from '@tanstack/react-router'
import {
  generateVideo,
  generationParamsFromBody,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { grokVideo } from '@tanstack/ai-grok'
import {
  reconstructGeneration,
  withGenerationPersistence,
} from '@tanstack/ai-persistence'
import { replayGenerationIfResuming } from '../lib/generation-durability'
import {
  artifactServeUrl,
  generationServerPersistence,
} from '../lib/generation-server-store'

/**
 * Video generation, durable end to end — the activity that needs it most: a run
 * takes minutes, so a refresh mid-job is the normal case rather than the edge.
 *
 * - STATE: `withGenerationPersistence` records the run and copies the finished
 *   video into our blob store, and `artifactUrl` rewrites the result to the
 *   shared `/api/artifacts` route — so it still plays after the provider's link
 *   expires.
 * - DELIVERY + LIFETIME: `memoryStream` logs each chunk for replay, and because
 *   a durable response is decoupled from its request, a reload cancels only the
 *   reader — the run keeps polling to completion into the log, and the client's
 *   `joinRun` on mount tails it to the end. No route-side detachment needed; the
 *   library owns the run's lifetime once `durability` is set.
 *
 * The GET does two jobs: `joinRun` delivery replay for an in-flight run, then
 * `?threadId=` mount hydration for a finished run whose delivery log aged out.
 */
export const Route = createFileRoute('/api/generate/video')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        // Adapter arguments come straight off the envelope's `data`: `size` and
        // `model` are adapter-specific unions that the provider-agnostic video
        // input widens to `string`.
        const { prompt, size, duration, model } = body.data
        const { threadId, runId } = generationParamsFromBody('video', body)

        // Persistence needs the scope named. It is a type error to wire the
        // middleware without one, so reject the request rather than inventing
        // an id the client could never hydrate by.
        if (!threadId) {
          return new Response(
            '`threadId` is required — it is the scope this generation is filed under.',
            { status: 400 },
          )
        }

        const stream = generateVideo({
          adapter: grokVideo(model ?? 'grok-imagine-video'),
          prompt,
          size,
          duration,
          stream: true,
          pollingInterval: 3000,
          maxDuration: 600_000,
          ...(threadId ? { threadId } : {}),
          ...(runId ? { runId } : {}),
          middleware: [
            withGenerationPersistence(generationServerPersistence(), {
              threadId,
              artifactUrl: (ref) => artifactServeUrl(ref.artifactId),
            }),
          ],
        })

        // Durable delivery: the run survives a reload and keeps polling to
        // completion into the log; a mount-time `joinRun` tails it to the end.
        return toServerSentEventsResponse(stream, {
          durability: { adapter: memoryStream(request) },
        })
      },

      // Two independent jobs, resolved in order (like the image route):
      // 1. `joinRun` delivery replay, when the request carries a resume offset —
      //    re-attach to a run still in flight from a previous request.
      // 2. Mount hydration for `persistence: true`: the latest run for
      //    `?threadId=`, as `{ resumeSnapshot, activeRun }`, so a completed
      //    video (aged out of the delivery log) still restores after a reload.
      GET: async ({ request }) =>
        replayGenerationIfResuming(request) ??
        (await reconstructGeneration(generationServerPersistence(), request)),
    },
  },
})
