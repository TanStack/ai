import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsResponse } from '@tanstack/ai'
import type { Feature, Provider } from '@/lib/types'
import { createTextAdapter } from '@/lib/providers'
import { featureConfigs } from '@/lib/features'

export const Route = createFileRoute('/api/chat')({
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
        const previousInteractionId: string | undefined =
          typeof data?.previousInteractionId === 'string'
            ? data.previousInteractionId
            : undefined

        const config = featureConfigs[feature]
        const modelOverride = config.modelOverrides?.[provider]
        const adapterOptions = createTextAdapter(
          provider,
          modelOverride,
          aimockPort,
          testId,
          feature,
        )

        const modelOptions = previousInteractionId
          ? {
              ...config.modelOptions,
              previous_interaction_id: previousInteractionId,
            }
          : config.modelOptions

        try {
          const stream = chat({
            ...adapterOptions,
            tools: config.tools,
            modelOptions,
            systemPrompts: ['You are a helpful assistant for a guitar store.'],
            agentLoopStrategy: maxIterations(5),
            messages,
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          console.error(`[api.chat] Error:`, error.message)
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
