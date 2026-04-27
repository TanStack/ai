import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
  toolDefinition,
} from '@tanstack/ai'
import type { ChatMiddleware } from '@tanstack/ai'
import { z } from 'zod'
import { createTextAdapter } from '@/lib/providers'

const weatherTool = toolDefinition({
  name: 'get_weather',
  description: 'Get weather',
  inputSchema: z.object({ city: z.string() }),
}).server(async (args) =>
  JSON.stringify({ city: args.city, temperature: 72, condition: 'sunny' }),
)

const chunkTransformMiddleware: ChatMiddleware = {
  name: 'chunk-transform',
  onChunk(_ctx, chunk) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
      return {
        ...chunk,
        delta: '[MW] ' + chunk.delta,
        content: '[MW] ' + (chunk.content || ''),
      }
    }
    return chunk
  },
}

const toolSkipMiddleware: ChatMiddleware = {
  name: 'tool-skip',
  onBeforeToolCall(_ctx, hookCtx) {
    if (hookCtx.toolName === 'get_weather') {
      return {
        type: 'skip' as const,
        result: JSON.stringify({ skipped: true, reason: 'middleware' }),
      }
    }
    return undefined
  },
}

export const Route = createFileRoute('/api/middleware-test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal?.aborted) return new Response(null, { status: 499 })
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
        const scenario =
          typeof fp.scenario === 'string' ? fp.scenario : 'basic-text'
        const middlewareMode =
          typeof fp.middlewareMode === 'string' ? fp.middlewareMode : 'none'
        const testId: string | undefined =
          typeof fp.testId === 'string' ? fp.testId : undefined
        const aimockPort: number | undefined =
          fp.aimockPort != null ? Number(fp.aimockPort) : undefined

        try {
          const adapterOptions = createTextAdapter(
            'openai',
            undefined,
            aimockPort,
            testId,
          )

          const middleware: ChatMiddleware[] = []

          if (middlewareMode === 'chunk-transform')
            middleware.push(chunkTransformMiddleware)
          if (middlewareMode === 'tool-skip')
            middleware.push(toolSkipMiddleware)

          const tools = scenario === 'with-tool' ? [weatherTool] : []

          const stream = chat({
            ...adapterOptions,
            messages: params.messages,
            tools,
            middleware,
            threadId: params.threadId,
            runId: params.runId,
            agentLoopStrategy: maxIterations(10),
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          console.error('[api.middleware-test] Error:', error.message)
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
