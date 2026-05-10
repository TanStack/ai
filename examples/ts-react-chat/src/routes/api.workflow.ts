import { createFileRoute } from '@tanstack/react-router'
import {
  handleWorkflowRequest,
  inMemoryRunStore,
} from '@tanstack/ai-orchestration'
import { articleWorkflow } from '@/lib/workflows/article-workflow'

// Process-local store. Survives across requests; lost on restart.
const runStore = inMemoryRunStore({ ttl: 60 * 60 * 1000 })

export const Route = createFileRoute('/api/workflow')({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleWorkflowRequest({
          request,
          runStore,
          workflow: articleWorkflow,
        }),
    },
  },
})
