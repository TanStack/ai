import { createFileRoute } from '@tanstack/react-router'
import { toServerSentEventsResponse } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Provider-free harness route for the SERVER-DRIVEN generation-persistence
 * story (`persistence: true` + `threadId`). It is the server-authoritative
 * counterpart to `api.generation-persistence.ts` (the client-driven variant).
 *
 * The client keeps NO local store; on mount it probes the GET below with a
 * `?threadId=` query and restores transparently from the returned
 * `reconstructGeneration`-shaped JSON (`{ resumeSnapshot, activeRun }`) into the
 * normal `result` / `status` fields. To make the round-trip real, POST records
 * the finished job in a module-level in-memory map keyed by `threadId`, and GET
 * reads it back — so a full `page.reload()` (empty client storage) still
 * restores the last run's status + a `result` whose image comes from the durable
 * artifact URL, exactly the path `reconstructGeneration` serves in production.
 *
 * We hand-build the JSON here rather than pull `@tanstack/ai-persistence` into
 * the e2e app (it is not a dependency), mirroring the `server-interrupt`
 * scenario in `api.persistence-durability.ts`. `reconstructGeneration` itself is
 * unit-tested in `@tanstack/ai-persistence`; this proves the CLIENT restore.
 *
 * Exempt from the aimock policy: this route streams a fixed AG-UI sequence and
 * never reaches an LLM provider's HTTP layer, so there is nothing to mock.
 */

// 1x1 transparent PNG — the live result's inline bytes, never persisted.
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// Durable app-origin serve URL for the generated image (as
// `withGenerationPersistence`'s `artifactUrl` would stamp it).
const DURABLE_IMAGE_URL = '/durable/generation-server/image-1.png'

// Server-authoritative record of the last completed generation per thread. In
// production this is a `GenerationRunStore` row; here a process-lifetime map is
// enough for the reload round-trip (the e2e server stays up across reloads).
const completedByThread = new Map<string, Record<string, unknown>>()

function stringField(body: unknown, key: string): string | undefined {
  if (typeof body !== 'object' || body === null || !(key in body)) {
    return undefined
  }
  const value: unknown = (body as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

function imageArtifact(threadId: string, runId: string) {
  return {
    role: 'output',
    artifactId: 'artifact-image-1',
    threadId,
    runId,
    name: 'image-1.png',
    mimeType: 'image/png',
    size: 68,
    createdAt: new Date(0).toISOString(),
    url: DURABLE_IMAGE_URL,
    source: {
      activity: 'image',
      path: 'images.0',
      provider: 'mock',
      model: 'mock-image-model',
      mediaType: 'image',
    },
  }
}

/** The metadata + durable artifact ref the server persists (never the bytes). */
function persistedResult(threadId: string, runId: string) {
  return {
    id: 'image-1',
    model: 'mock-image-model',
    artifacts: [imageArtifact(threadId, runId)],
  }
}

function imageRun(threadId: string, runId: string): AsyncIterable<StreamChunk> {
  return (async function* () {
    yield {
      type: 'RUN_STARTED',
      threadId,
      runId,
      timestamp: Date.now(),
    } as StreamChunk
    yield {
      type: 'CUSTOM',
      name: 'generation:result',
      value: {
        id: 'image-1',
        model: 'mock-image-model',
        images: [{ b64Json: TINY_PNG_B64 }],
        artifacts: [imageArtifact(threadId, runId)],
      },
      threadId,
      runId,
      timestamp: Date.now(),
    } as StreamChunk
    yield {
      type: 'RUN_FINISHED',
      threadId,
      runId,
      timestamp: Date.now(),
    } as StreamChunk
    // The run finished: record the job the way `withGenerationPersistence`
    // would, so the GET restore below can rebuild it after a reload.
    completedByThread.set(threadId, persistedResult(threadId, runId))
  })()
}

export const Route = createFileRoute('/api/generation-persistence-server')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // The client sends an AG-UI RunAgentInput body carrying the hook's
        // stable `threadId` (via runContext) — the same id the GET restore
        // probe queries — plus the run id in the X-Run-Id header.
        const body: unknown = await request.json()
        const threadId = stringField(body, 'threadId') ?? 'generation-server'
        const runId =
          request.headers.get('X-Run-Id') ??
          stringField(body, 'runId') ??
          `run-${Date.now()}`
        return toServerSentEventsResponse(imageRun(threadId, runId))
      },

      // Server-authoritative restore: the `persistence: true` client's mount
      // probe (`?threadId=`). Returns the same `{ resumeSnapshot, activeRun }`
      // shape `reconstructGeneration` produces — a `complete` snapshot whose
      // result carries the durable artifact ref once the thread has a recorded
      // job, else the empty first-load answer.
      GET: ({ request }) => {
        const threadId = new URL(request.url).searchParams.get('threadId') ?? ''
        const result = threadId ? completedByThread.get(threadId) : undefined
        const body = result
          ? {
              resumeSnapshot: {
                schemaVersion: 1,
                resumeState: null,
                status: 'complete',
                activity: 'image',
                result,
              },
              activeRun: null,
            }
          : { resumeSnapshot: null, activeRun: null }
        return new Response(JSON.stringify(body), {
          headers: {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          },
        })
      },
    },
  },
})
