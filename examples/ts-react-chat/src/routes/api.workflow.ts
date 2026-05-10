import { createFileRoute } from '@tanstack/react-router'
import {
  inMemoryRunStore,
  resumeWorkflow,
  runWorkflow,
  toWorkflowSSEResponse,
} from '@tanstack/ai-orchestration'
import { articleWorkflow } from '@/lib/workflows/article-workflow'

// Process-local store. Survives across requests; lost on restart.
const runStore = inMemoryRunStore({ ttl: 60 * 60 * 1000 })

export const Route = createFileRoute('/api/workflow')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          input?: { topic: string }
          runId?: string
          approval?: { approvalId: string; approved: boolean }
          abort?: boolean
        }

        if (body.abort && body.runId) {
          // v1: abort signal plumbing TODO. No-op response.
          return new Response(null, { status: 204 })
        }

        if (body.approval && body.runId) {
          return toWorkflowSSEResponse(
            resumeWorkflow({
              runId: body.runId,
              runStore,
              approval: {
                approvalId: body.approval.approvalId,
                approved: body.approval.approved,
              },
            }),
          )
        }

        if (!body.input) {
          return new Response('input required', { status: 400 })
        }

        return toWorkflowSSEResponse(
          runWorkflow({
            workflow: articleWorkflow as any,
            input: body.input,
            runStore,
          }),
        )
      },
    },
  },
})
