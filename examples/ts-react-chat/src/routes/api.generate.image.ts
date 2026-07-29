import { createFileRoute } from '@tanstack/react-router'
import {
  generateImage,
  generationParamsFromRequest,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { grokImage } from '@tanstack/ai-grok'
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
 * every generation activity here shares.
 *
 * Chunks are also logged for replay (see `../lib/generation-durability`), so
 * the GET does two independent jobs, like the persistent-chat route: a
 * `joinRun` delivery replay when the request carries a resume offset, and
 * otherwise the `?threadId=` mount hydration that `persistence: true` calls.
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

        // Delivery durability: chunks are logged and id-tagged, so a reconnect
        // or a mount-time `joinRun` replays instead of re-running the model.
        return toServerSentEventsResponse(stream, {
          durability: { adapter: memoryStream(request) },
        })
      },

      // Two independent jobs, resolved in order:
      // 1. `joinRun` delivery replay, when the request carries a resume offset.
      // 2. Mount hydration for `persistence: true`: the latest run for
      //    `?threadId=`, as `{ resumeSnapshot, activeRun }`. Pass `authorize`
      //    here in a multi-user app.
      GET: async ({ request }) =>
        replayGenerationIfResuming(request) ??
        (await reconstructGeneration(generationServerPersistence(), request)),
    },
  },
})
