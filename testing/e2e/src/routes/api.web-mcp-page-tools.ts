import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  mergeAgentTools,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createTextAdapter } from '@/lib/providers'

/**
 * Server half of the page WebMCP tools spec. The server has no tools of its
 * own. It runs only the client-declared tools that `usePageWebMCPTools` read
 * from `document.modelContext`, so a tool call proves the page tools reached
 * the request.
 */
export const Route = createFileRoute('/api/web-mcp-page-tools')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())

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

        const stream = chat({
          ...createTextAdapter('openai', undefined, undefined, testId),
          tools: mergeAgentTools([], params.tools),
          agentLoopStrategy: maxIterations(5),
          messages: params.messages,
          threadId: params.threadId,
          runId: params.runId,
          ...(params.parentRunId && { parentRunId: params.parentRunId }),
          ...(params.resume && { resume: params.resume }),
        })
        return toServerSentEventsResponse(stream)
      },
    },
  },
})
