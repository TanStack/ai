import { createFileRoute } from '@tanstack/react-router'
import {
  handleWorkflowRequest,
  inMemoryRunStore,
} from '@tanstack/ai-orchestration'
import { featureOrchestrator } from '@/lib/workflows/orchestrator'

const runStore = inMemoryRunStore({ ttl: 60 * 60 * 1000 })

export const Route = createFileRoute('/api/orchestration')({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleWorkflowRequest({
          request,
          runStore,
          workflow: featureOrchestrator,
        }),
    },
  },
})
