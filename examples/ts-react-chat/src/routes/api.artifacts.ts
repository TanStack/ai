import { createFileRoute } from '@tanstack/react-router'
import { retrieveArtifact, retrieveBlob } from '@tanstack/ai-persistence'
import { generationServerPersistence } from '../lib/generation-server-store'

/**
 * The one route that serves persisted generation media, for every activity.
 *
 * `withGenerationPersistence` stores each generated file's bytes in the blob
 * store and stamps an app-origin URL onto every artifact ref via `artifactUrl`
 * — that URL points here. Because artifacts are addressed by their own id and
 * carry their own `mimeType`, nothing about serving them is activity-specific:
 * an image, a video, a music clip and a speech track all come back through this
 * handler. Keeping it in one place is also what keeps the authorization check
 * below in one place.
 *
 * `artifactServeUrl` in `../lib/generation-server-store` builds the URL, so the
 * two stay in step.
 */
export const Route = createFileRoute('/api/artifacts')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const artifactId = new URL(request.url).searchParams.get('id')
        if (!artifactId) {
          return new Response('missing artifact id', { status: 400 })
        }

        const persistence = generationServerPersistence()
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
            // Artifact ids are content-addressed by run: the bytes behind an id
            // never change, so this is safe to cache hard. `private` because a
            // real deployment serves these per-user.
            'cache-control': 'private, max-age=31536000, immutable',
          },
        })
      },
    },
  },
})
