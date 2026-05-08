import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toJSONResponse } from '@tanstack/ai'
import type { Feature, Provider } from '@/lib/types'
import { createTextAdapter } from '@/lib/providers'
import { featureConfigs } from '@/lib/features'

// Companion route for the SSE-based /api/chat that drains the chat stream
// fully and returns it as a single JSON array. Pairs with the `fetchJSON`
// connection adapter on the client to exercise the toJSONResponse → fetchJSON
// roundtrip used by non-streaming runtimes (Expo, certain edge proxies).
export const Route = createFileRoute('/api/chat-json')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        const body = await request.json()
        const { messages, data } = body
        const provider: Provider = data?.provider || 'openai'
        const feature: Feature = data?.feature || 'chat'
        const testId: string | undefined =
          typeof data?.testId === 'string' ? data.testId : undefined
        const aimockPort: number | undefined =
          data?.aimockPort != null ? Number(data.aimockPort) : undefined

        const config = featureConfigs[feature]
        const modelOverride = config.modelOverrides?.[provider]
        const adapterOptions = createTextAdapter(
          provider,
          modelOverride,
          aimockPort,
          testId,
        )

        try {
          const stream = chat({
            ...adapterOptions,
            tools: config.tools,
            modelOptions: config.modelOptions,
            systemPrompts: ['You are a helpful assistant for a guitar store.'],
            agentLoopStrategy: maxIterations(5),
            messages,
            abortController,
          })

          return toJSONResponse(stream, { abortController })
        } catch (error: any) {
          console.error(`[api.chat-json] Error:`, error.message)
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          return new Response(
            JSON.stringify({ error: error.message || 'An error occurred' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
