import { createFileRoute } from '@tanstack/react-router'
import { toServerSentEventsResponse } from '@tanstack/ai'
import {
  inMemoryRunStore,
  parseWorkflowRequest,
  runWorkflow,
} from '@tanstack/ai-orchestration'
import { articleWorkflow } from '@/lib/workflows/article-workflow'

// Process-local store. Survives across requests; lost on restart.
const runStore = inMemoryRunStore({ ttl: 60 * 60 * 1000 })

export const Route = createFileRoute('/api/workflow')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = await parseWorkflowRequest(request)
        if (params.abort && params.runId) {
          runStore.getLive(params.runId)?.abortController.abort()
          return new Response(null, { status: 204 })
        }
        const stream = runWorkflow({
          runStore,
          workflow: articleWorkflow,
          ...params,
        })
        return toServerSentEventsResponse(stream)
      },
    },
  },
})
