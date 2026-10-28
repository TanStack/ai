import { createFileRoute } from '@tanstack/react-router'
import { retrieveArtifact, retrieveBlob } from '@tanstack/ai-persistence'
import { generationServerPersistence } from '../lib/generation-server-persistence'

/**
 * Serves a persisted generation artifact's bytes by id, straight from the
 * `retrieveArtifact` / `retrieveBlob` helpers. `withGenerationPersistence`'s
 * `artifactUrl` stamps `?id=<artifactId>` onto each stored image, so a restored
 * run renders its media from this route (our own origin) rather than the
 * provider's expiring URL.
 */
export const Route = createFileRoute('/api/generate/image/artifact')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get('id')
        if (!id) return new Response('missing id', { status: 400 })

        const artifact = await retrieveArtifact(generationServerPersistence, id)
        if (!artifact) return new Response('not found', { status: 404 })

        const blob = await retrieveBlob(generationServerPersistence, artifact)
        if (!blob) return new Response('not found', { status: 404 })

        return new Response(blob.body ?? (await blob.arrayBuffer()), {
          headers: {
            'content-type': artifact.mimeType,
            'content-length': String(artifact.size),
          },
        })
      },
    },
  },
})
