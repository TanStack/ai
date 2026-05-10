import { createFileRoute } from '@tanstack/react-router'
import {
  inMemoryRunStore,
  resumeWorkflow,
  runWorkflow,
  toWorkflowSSEResponse,
} from '@tanstack/ai-orchestration'
import { featureOrchestrator } from '@/lib/workflows/orchestrator'

const runStore = inMemoryRunStore({ ttl: 60 * 60 * 1000 })

export const Route = createFileRoute('/api/orchestration')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          input?: { userMessage: string }
          runId?: string
          approval?: { approvalId: string; approved: boolean }
        }

        if (body.approval && body.runId) {
          return toWorkflowSSEResponse(
            resumeWorkflow({
              runId: body.runId,
              runStore,
              approval: body.approval,
            }),
          )
        }

        if (!body.input) {
          return new Response('input required', { status: 400 })
        }

        return toWorkflowSSEResponse(
          runWorkflow({
            workflow: featureOrchestrator as any,
            input: body.input,
            runStore,
          }),
        )
      },
    },
  },
})
