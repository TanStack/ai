import { createFileRoute } from '@tanstack/react-router'
import {
  generateImage,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { grokImage } from '@tanstack/ai-grok'
import {
  reconstructGeneration,
  withGenerationPersistence,
} from '@tanstack/ai-persistence'
import {
  artifactServeUrl,
  generationServerPersistence,
} from '../lib/generation-server-store'

/**
 * Image generation with SERVER-side persistence — the other half of the
 * client-driven adapter in `generation-persistence.ts`.
 *
 * `withGenerationPersistence` records each run in `stores.generationRuns` and,
 * because this backend also has `artifacts` + `blobs`, copies the generated
 * bytes out of the provider's expiring URL into our own store. `artifactUrl`
 * then stamps an app-origin serve URL onto every ref and rewrites the live
 * result to it — so both the live and the restored image render from here.
 *
 * The stores are SQLite-backed, so a generated image is still there after a
 * dev-server restart — reload the page and it renders from the database.
 *
 * The bytes themselves are served by the shared `/api/artifacts` route, which
 * every generation activity here shares. This GET only answers the `?threadId=`
 * mount hydration that `persistence: true` on the client calls.
 */
export const Route = createFileRoute('/api/generate/image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Carries `threadId` / `runId` off the AG-UI envelope as well as the
        // input, so the run record is filed under the scope the client will
        // later hydrate by.
        const { input, threadId, runId } = await generationParamsFromRequest(
          'image',
          request,
        )
        if (typeof input.prompt !== 'string') {
          throw new Error('This endpoint accepts text image prompts only.')
        }

        const stream = generateImage({
          adapter: grokImage('grok-imagine-image'),
          prompt: input.prompt,
          // `size` is deliberately not forwarded: the generic image input types
          // it as `string`, while each adapter narrows it to its own union, and
          // this page's UI never sends one.
          ...(input.numberOfImages
            ? { numberOfImages: input.numberOfImages }
            : {}),
          ...(threadId ? { threadId } : {}),
          ...(runId ? { runId } : {}),
          stream: true,
          middleware: [
            withGenerationPersistence(generationServerPersistence(), {
              artifactUrl: (ref) => artifactServeUrl(ref.artifactId),
            }),
          ],
        })

        return toServerSentEventsResponse(stream)
      },

      // Mount hydration for `persistence: true`: resolves the latest run for
      // `?threadId=` and returns `{ resumeSnapshot, activeRun }`. Pass
      // `authorize` here in a multi-user app.
      GET: async ({ request }) =>
        await reconstructGeneration(generationServerPersistence(), request),
    },
  },
})
