import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
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

        try {
          const body = await request.json()
          const messages = body.messages
          const scenario = body.data?.scenario || 'basic-text'
          const middlewareMode = body.data?.middlewareMode || 'none'
          const testId: string | undefined =
            typeof body.data?.testId === 'string' ? body.data.testId : undefined
          const aimockPort: number | undefined =
            body.data?.aimockPort != null
              ? Number(body.data.aimockPort)
              : undefined

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
            messages,
            tools,
            middleware,
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
