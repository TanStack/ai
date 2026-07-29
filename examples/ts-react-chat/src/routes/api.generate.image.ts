import { createFileRoute } from '@tanstack/react-router'
import {
  generateImage,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { grokImage } from '@tanstack/ai-grok'
import {
  reconstructGeneration,
  retrieveArtifact,
  retrieveBlob,
  withGenerationPersistence,
} from '@tanstack/ai-persistence'
import {
  artifactServeUrl,
  generationServerPersistence as persistence,
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
 * The GET does double duty, which is why it branches:
 * - `?artifact=<id>` serves stored bytes (the URL `artifactUrl` produced).
 * - otherwise `reconstructGeneration` answers a `?threadId=` mount hydration,
 *   which is what `persistence: true` on the client calls.
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
            withGenerationPersistence(persistence, {
              artifactUrl: (ref) => artifactServeUrl(ref.artifactId),
            }),
          ],
        })

        return toServerSentEventsResponse(stream)
      },

      GET: async ({ request }) => {
        const artifactId = new URL(request.url).searchParams.get('artifact')

        if (artifactId) {
          const artifact = await retrieveArtifact(persistence, artifactId)
          if (!artifact) return new Response('not found', { status: 404 })

          // A real multi-user app MUST authorize here before serving: the id
          // comes from the caller, and `ArtifactRecord` carries the `threadId`
          // to check it against. This demo is single-user, so there is no
          // session to check.
          const blob = await retrieveBlob(persistence, artifact)
          if (!blob) return new Response('not found', { status: 404 })

          return new Response(blob.body ?? (await blob.arrayBuffer()), {
            headers: {
              'content-type': artifact.mimeType,
              'content-length': String(artifact.size),
            },
          })
        }

        // Mount hydration for `persistence: true`: resolves the latest run for
        // `?threadId=` and returns `{ resumeSnapshot, activeRun }`. Pass
        // `authorize` here in a multi-user app.
        return await reconstructGeneration(persistence, request)
      },
    },
  },
})
