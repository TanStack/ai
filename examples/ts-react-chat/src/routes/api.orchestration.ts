import { createFileRoute } from '@tanstack/react-router'
import { toServerSentEventsResponse } from '@tanstack/ai'
import {
  inMemoryRunStore,
  parseWorkflowRequest,
  runWorkflow,
} from '@tanstack/ai-orchestration'
import { featureOrchestrator } from '@/lib/workflows/orchestrator'

const runStore = inMemoryRunStore({ ttl: 60 * 60 * 1000 })

export const Route = createFileRoute('/api/orchestration')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = await parseWorkflowRequest(request)
        const stream = runWorkflow({
          runStore,
          workflow: featureOrchestrator,
          ...params,
        })
        return toServerSentEventsResponse(stream)
      },
    },
  },
})
