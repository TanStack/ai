import { createFileRoute } from '@tanstack/react-router'
import { generateVideo, generationParamsFromBody } from '@tanstack/ai'
import { grokVideo } from '@tanstack/ai-grok'
import { withGenerationPersistence } from '@tanstack/ai-persistence'
import {
  replayGenerationIfResuming,
  startDetachedGeneration,
  tailGenerationResponse,
} from '../lib/generation-durability'
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
 * - DELIVERY + LIFETIME: the run is detached from this request and its chunks
 *   go to a replayable log (see `../lib/generation-durability`), so a reload
 *   neither kills the job nor loses the events emitted while away.
 *
 * The GET is what the client's `joinRun` calls on mount to tail a run that was
 * still going when the page went away.
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

        // Durability is keyed by run id. A client that sends none has no id to
        // rejoin with either, so minting one here costs nothing and keeps the
        // producer/reader split uniform.
        const resolvedRunId = runId ?? crypto.randomUUID()

        startDetachedGeneration(resolvedRunId, () =>
          generateVideo({
            adapter: grokVideo(model ?? 'grok-imagine-video'),
            prompt,
            size,
            duration,
            stream: true,
            pollingInterval: 3000,
            maxDuration: 600_000,
            runId: resolvedRunId,
            ...(threadId ? { threadId } : {}),
            middleware: [
              withGenerationPersistence(generationServerPersistence(), {
                artifactUrl: (ref) => artifactServeUrl(ref.artifactId),
              }),
            ],
            // No client abortController: the run owns its own lifetime.
          }),
        )

        // Tail the log rather than the model, so cancelling this response (a
        // reload) cancels only the reader.
        return tailGenerationResponse(resolvedRunId)
      },

      // `joinRun` replay — re-attach to a run still in flight from a previous
      // request. Returns 404 when the run is unknown or its log has aged out,
      // rather than serving the SPA shell the client cannot parse as SSE.
      GET: ({ request }) =>
        replayGenerationIfResuming(request) ??
        new Response('no resumable run', { status: 404 }),
    },
  },
})
