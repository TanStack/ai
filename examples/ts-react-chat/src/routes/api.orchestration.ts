import { createFileRoute } from '@tanstack/react-router'
import { toServerSentEventsResponse } from '@tanstack/ai'
import {
  WorkflowRequestParseError,
  inMemoryRunStore,
  parseWorkflowRequest,
  runWorkflow,
} from '@tanstack/ai-orchestration'
import { featureOrchestrator } from '@/lib/workflows/orchestrator'

const runStore = inMemoryRunStore({ ttl: 60 * 60 * 1000 })
const abortControllers = new Map<string, AbortController>()

export const Route = createFileRoute('/api/orchestration')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const params = await parseWorkflowRequest(request)
          if (params.abort && params.runId) {
            abortControllers.get(params.runId)?.abort()
            return new Response(null, { status: 204 })
          }
          const abortController = new AbortController()
          if (params.runId) {
            abortControllers.set(params.runId, abortController)
          }
          const stream = runWorkflow({
            runStore,
            workflow: featureOrchestrator,
            signal: abortController.signal,
            ...params,
          })
          return toServerSentEventsResponse(
            (async function* () {
              try {
                yield* stream
              } finally {
                if (
                  params.runId &&
                  abortControllers.get(params.runId) === abortController
                ) {
                  abortControllers.delete(params.runId)
                }
              }
            })(),
          )
        } catch (err) {
          const error = err as Error
          if (err instanceof WorkflowRequestParseError) {
            return Response.json(
              { error: 'invalid_request', message: error.message },
              { status: 400 },
            )
          }
          const message =
            err instanceof Error ? error.message : 'Unknown server error'
          return Response.json(
            { error: 'internal_error', message },
            { status: 500 },
          )
        }
      },
    },
  },
})
