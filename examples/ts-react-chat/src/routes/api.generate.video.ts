import { createFileRoute } from '@tanstack/react-router'
import {
  generateVideo,
  generationParamsFromBody,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { grokVideo } from '@tanstack/ai-grok'
import { withGenerationPersistence } from '@tanstack/ai-persistence'
import {
  artifactServeUrl,
  generationServerPersistence,
} from '../lib/generation-server-store'

/**
 * Video generation with SERVER-side persistence.
 *
 * Video is where durable bytes matter most: a run takes minutes and the
 * provider's result URL expires. `withGenerationPersistence` copies the file
 * into our blob store, and `artifactUrl` rewrites the result to the shared
 * `/api/artifacts` route — so the video still plays long after the provider
 * link is dead.
 *
 * The adapter arguments are read straight off the envelope's `data`, because
 * `size` / `model` are adapter-specific unions that the provider-agnostic video
 * input widens to `string`. `generationParamsFromBody` is used for the run's
 * IDENTITY only: it carries `threadId` / `runId` off the AG-UI envelope, so the
 * run is filed under the scope the client hydrates by.
 */
export const Route = createFileRoute('/api/generate/video')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, size, duration, model } = body.data
        const { threadId, runId } = generationParamsFromBody('video', body)

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
              artifactUrl: (ref) => artifactServeUrl(ref.artifactId),
            }),
          ],
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
