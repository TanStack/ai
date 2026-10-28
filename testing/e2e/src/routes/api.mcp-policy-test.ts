import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createMCPClient } from '@tanstack/ai-mcp'
import { createTextAdapter } from '@/lib/providers'

/** `chat({ mcp })` with the client tool policy named by `forwardedProps.policy`. */
export const Route = createFileRoute('/api/mcp-policy-test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        const fp = params.forwardedProps
        const testId = typeof fp.testId === 'string' ? fp.testId : undefined
        const aimockPort =
          fp.aimockPort != null ? Number(fp.aimockPort) : undefined
        const policy = typeof fp.policy === 'string' ? fp.policy : 'none'

        const origin = new URL(request.url).origin
        const client = await createMCPClient({
          transport: { type: 'http', url: `${origin}/api/mcp-server` },
          ...(policy === 'readOnly'
            ? {
                toolFilter: (tool) => tool.annotations?.readOnlyHint === true,
              }
            : {}),
          ...(policy === 'approval' ? { needsApproval: () => true } : {}),
        })

        const stream = chat({
          ...createTextAdapter('openai', undefined, aimockPort, testId),
          messages: params.messages,
          threadId: params.threadId,
          runId: params.runId,
          mcp: { clients: [client] },
          agentLoopStrategy: maxIterations(5),
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
