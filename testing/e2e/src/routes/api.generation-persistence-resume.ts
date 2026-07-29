import { createFileRoute } from '@tanstack/react-router'
import {
  memoryStream,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Provider-free harness for the DURABLE, mid-run reload story — the guarantee a
 * plain `persistence: true` restore can't prove: a one-shot generation whose
 * client disconnects while it is still producing keeps running to its terminal
 * and is tailed to completion by a mount-time `joinRun`.
 *
 * The run deliberately pauses between `RUN_STARTED` and its result, opening a
 * window to reload mid-run. Because the POST wraps the stream in a `memoryStream`
 * durability sink, the producer is decoupled from the delivery socket: cancelling
 * the response (the reload) cancels only the reader, while the run drains its
 * remaining chunks into the log. On mount the client GETs `?threadId=`, sees an
 * `activeRun`, and `joinRun`s the log's resume cursor to the end — so the run
 * finishes even though no client was connected when it did.
 *
 * The GET does double duty, exactly like the production generation routes:
 *  - a request carrying a resume offset is a `joinRun` replay — serve the log;
 *  - otherwise a `?threadId=` mount probe — answer with the
 *    `reconstructGeneration` shape (`{ resumeSnapshot, activeRun }`), reporting
 *    `activeRun` while the run is in flight and a `complete` snapshot once done.
 *
 * Exempt from the aimock policy: a fixed AG-UI sequence, never an LLM provider.
 */

// 1x1 transparent PNG — the live result's inline bytes.
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// Durable app-origin serve URL, the way `withGenerationPersistence`'s
// `artifactUrl` would stamp it. Present on the streamed result too, so the
// rejoined image renders from our own origin.
const DURABLE_IMAGE_URL = '/durable/generation-resume/image-1.png'

// The run holds its result until the client has disconnected (the reload), then
// settles briefly so the remounted client's mount probe reliably observes the
// run as still `running` and takes the `joinRun` path. `DISCONNECT_FALLBACK_MS`
// only matters if this runtime never fires `request.signal` on disconnect — the
// run still completes strictly after the reload either way.
const DISCONNECT_FALLBACK_MS = 3000
const SETTLE_AFTER_DISCONNECT_MS = 1500

// Runs still in flight per thread (the `activeRun` a mount probe reports), and
// the finished job per thread (the `complete` snapshot a late probe restores).
// Process-lifetime maps: the e2e server stays up across reloads.
const runningByThread = new Map<string, string>()
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

/**
 * The metadata a done-restore would surface. Its id is DELIBERATELY distinct
 * from the streamed run's `image-1`: this snapshot is only ever served when the
 * mount probe finds a run already `complete`, i.e. the plain done-restore path.
 * The spec asserts `image-1`, so if a reload ever degrades to a done-restore
 * instead of a mid-run rejoin, the test fails loudly instead of passing for the
 * wrong reason.
 */
function persistedResult(threadId: string, runId: string) {
  return {
    id: 'image-restored',
    model: 'mock-image-model',
    images: [{ url: DURABLE_IMAGE_URL }],
    artifacts: [imageArtifact(threadId, runId)],
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Resolves once the client disconnects, or after a fallback if it never does. */
function waitForDisconnect(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, DISCONNECT_FALLBACK_MS)
    signal.addEventListener('abort', finish, { once: true })
  })
}

function imageRun(
  threadId: string,
  runId: string,
  signal: AbortSignal,
): AsyncIterable<StreamChunk> {
  return (async function* () {
    // Mark the run in flight before the first chunk, so a mount probe that
    // races in right after the reload still sees the `activeRun` to rejoin.
    runningByThread.set(threadId, runId)
    yield {
      type: 'RUN_STARTED',
      threadId,
      runId,
      timestamp: Date.now(),
    } as StreamChunk
    // Hold the result until the client has disconnected (the reload), then a
    // short settle so the remounted client's probe still sees `running`. This
    // makes the result land strictly AFTER the reload — the run cannot complete
    // as a done-restore before the reload, so the rejoin is the path exercised.
    // A client that reloads here cancels only the socket; the durability pump
    // keeps draining this generator to its terminal.
    await waitForDisconnect(signal)
    await delay(SETTLE_AFTER_DISCONNECT_MS)
    yield {
      type: 'CUSTOM',
      name: 'generation:result',
      value: {
        id: 'image-1',
        model: 'mock-image-model',
        images: [{ url: DURABLE_IMAGE_URL, b64Json: TINY_PNG_B64 }],
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
    // Terminal reached: record the finished job and drop the active marker, so a
    // probe after completion restores a `complete` snapshot instead of rejoining.
    completedByThread.set(threadId, persistedResult(threadId, runId))
    runningByThread.delete(threadId)
  })()
}

export const Route = createFileRoute('/api/generation-persistence-resume')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json()
        const threadId = stringField(body, 'threadId') ?? 'generation-resume'
        const runId =
          request.headers.get('X-Run-Id') ??
          stringField(body, 'runId') ??
          `run-${Date.now()}`
        // Durable delivery: the run survives the reload and drains to the log.
        // `request.signal` lets the run hold its result until the client is gone.
        return toServerSentEventsResponse(
          imageRun(threadId, runId, request.signal),
          { durability: { adapter: memoryStream(request) } },
        )
      },

      GET: ({ request }) => {
        // 1. A resume offset means this is a `joinRun` replay — tail the log.
        const durability = memoryStream(request)
        if (durability.resumeFrom() !== null) {
          return resumeServerSentEventsResponse({ adapter: durability })
        }

        // 2. Otherwise a `?threadId=` mount probe: report the in-flight run so
        //    the client rejoins it, or the finished job so it restores.
        const threadId = new URL(request.url).searchParams.get('threadId') ?? ''
        const runningRunId = threadId
          ? runningByThread.get(threadId)
          : undefined
        const completed = threadId ? completedByThread.get(threadId) : undefined
        const body = runningRunId
          ? {
              resumeSnapshot: {
                schemaVersion: 1,
                resumeState: { threadId, runId: runningRunId },
                status: 'running',
                activity: 'image',
              },
              activeRun: { runId: runningRunId },
            }
          : completed
            ? {
                resumeSnapshot: {
                  schemaVersion: 1,
                  resumeState: null,
                  status: 'complete',
                  activity: 'image',
                  result: completed,
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
