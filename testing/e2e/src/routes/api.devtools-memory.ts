import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { memoryMiddleware } from '@tanstack/ai-memory'
import { createTextAdapter } from '@/lib/providers'
import { devtoolsMemoryAdapter } from '@/lib/devtools-memory-store'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Chat endpoint for the `/devtools-memory` E2E route. Mirrors `/api/chat` but
 * wires `memoryMiddleware({ adapter: inMemory() })` so recall/save run and the
 * middleware injects the `memory:state` CUSTOM chunk the client devtools bridge
 * re-emits as `memory:*`. Scope is the per-test `testId`.
 */
export const Route = createFileRoute('/api/devtools-memory')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()

        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        const fp = params.forwardedProps as Record<string, unknown>
        const testId = typeof fp.testId === 'string' ? fp.testId : undefined
        const aimockPort =
          fp.aimockPort != null ? Number(fp.aimockPort) : undefined
        const sessionId = testId ?? 'devtools-memory'

        const adapterOptions = createTextAdapter(
          'openai',
          undefined,
          aimockPort,
          testId,
          'chat',
        )

        try {
          const memory = memoryMiddleware({
            adapter: devtoolsMemoryAdapter,
            scope: { sessionId },
          })

          const stream = chat({
            ...adapterOptions,
            tools: [],
            systemPrompts: [
              'You are a helpful assistant with long-term memory.',
            ],
            middleware: [memory],
            agentLoopStrategy: maxIterations(5),
            messages: params.messages,
            threadId: params.threadId,
            runId: params.runId,
            abortController,
          })

          return toServerSentEventsResponse(
            stream as AsyncIterable<StreamChunk>,
            { abortController },
          )
        } catch (error) {
          console.error('[api.devtools-memory] Error:', error)
          if (
            (error instanceof Error && error.name === 'AbortError') ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'error',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
