import { createFileRoute } from '@tanstack/react-router'
import {
  parseRangeHeader,
  retrieveArtifact,
  retrieveBlob,
} from '@tanstack/ai-persistence'
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

        // Video seeking is built on `Range`: the browser asks for a slice and
        // expects `206` + `Content-Range`, and Safari refuses to play a source
        // that ignores `Range` outright. `parseRangeHeader` resolves the
        // header against the known size, so an unsatisfiable range is a `416`
        // here rather than a bad `206`.
        const range = parseRangeHeader(
          request.headers.get('range'),
          artifact.size,
        )
        if (range === 'unsatisfiable') {
          return new Response('range not satisfiable', {
            status: 416,
            headers: { 'content-range': `bytes */${artifact.size}` },
          })
        }

        const blob = await retrieveBlob(
          persistence,
          artifact,
          range ? { range } : undefined,
        )
        if (!blob) return new Response('not found', { status: 404 })

        const cacheHeaders = {
          'content-type': artifact.mimeType,
          // Artifact ids are content-addressed by run: the bytes behind an id
          // never change, so this is safe to cache hard. `private` because a
          // real deployment serves these per-user.
          'cache-control': 'private, max-age=31536000, immutable',
          // Advertised on every response, so a player knows it can seek.
          'accept-ranges': 'bytes',
        }
        const body = blob.body ?? (await blob.arrayBuffer())

        if (blob.range) {
          const { offset, length } = blob.range
          return new Response(body, {
            status: 206,
            headers: {
              ...cacheHeaders,
              'content-length': String(length),
              'content-range': `bytes ${offset}-${offset + length - 1}/${artifact.size}`,
            },
          })
        }

        return new Response(body, {
          headers: {
            ...cacheHeaders,
            'content-length': String(artifact.size),
          },
        })
      },
    },
  },
})
