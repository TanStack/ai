import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  resumeJsonResponse,
  toJsonResponse,
} from '@tanstack/ai'
import {
  memoryPersistence,
  reconstructChat,
  withPersistence,
} from '@tanstack/ai-persistence'
import { createTextAdapter } from '@/lib/providers'
import { clientToolDefinitions, serverTools } from '@/lib/tools-test-tools'

/**
 * JSON transport harness (server half). The client is `fetchJson`.
 *
 * - POST runs `chat()` through aimock and answers with one JSON body from
 *   `toJsonResponse`. The run drains into a `memoryStream` log, so a short
 *   `?maxWaitMs=` replies early with `done: false` and the client polls.
 * - GET with a resume cursor (`?runId=&offset=`) reads the log through
 *   `resumeJsonResponse`. That is the poll and the `joinRun` path.
 * - GET with `?threadId=` is the `persistence: true` mount hydrate. It reads
 *   `withPersistence` state through `reconstructChat`, so a reload during a
 *   run sees `activeRun` and the client joins it.
 *
 * aimock is reached through the OpenAI adapter; `testId` / `aimockPort` ride
 * in `forwardedProps`.
 */

const persistence = memoryPersistence()

const tools = [
  serverTools.get_weather,
  serverTools.delete_file,
  clientToolDefinitions.show_notification,
]

function maxWaitMsFrom(request: Request) {
  const raw = new URL(request.url).searchParams.get('maxWaitMs')
  if (raw === null) return undefined
  const value = Number.parseInt(raw, 10)
  return Number.isNaN(value) ? undefined : value
}

export const Route = createFileRoute('/api/json-transport')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = await chatParamsFromRequest(request)
        const fp = params.forwardedProps
        const testId = typeof fp.testId === 'string' ? fp.testId : undefined
        const aimockPort =
          fp.aimockPort != null ? Number(fp.aimockPort) : undefined

        const stream = chat({
          ...createTextAdapter('openai', undefined, aimockPort, testId),
          messages: params.messages,
          tools,
          threadId: params.threadId,
          runId: params.runId,
          ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
          ...(params.resume ? { resume: params.resume } : {}),
          middleware: [withPersistence(persistence)],
        })

        return toJsonResponse(stream, {
          durability: { adapter: memoryStream(request) },
          signal: request.signal,
          maxWaitMs: maxWaitMsFrom(request),
        })
      },

      GET: ({ request }) => {
        const durability = memoryStream(request)
        if (durability.resumeFrom() !== null) {
          return resumeJsonResponse({ adapter: durability })
        }
        return reconstructChat(persistence, request, {
          authorize: (threadId) => threadId.length > 0,
        })
      },
    },
  },
})
