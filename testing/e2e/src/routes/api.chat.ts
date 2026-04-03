import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsResponse } from '@tanstack/ai'
import type { Feature, Provider } from '@/lib/types'
import { createTextAdapter } from '@/lib/providers'
import { featureConfigs } from '@/lib/features'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        const body = await request.json()
        const { messages, data } = body
        const provider: Provider = data?.provider || 'openai'
        const feature: Feature = data?.feature || 'chat'

        const config = featureConfigs[feature]
        const modelOverride = config.modelOverrides?.[provider]
        const adapterOptions = createTextAdapter(provider, modelOverride)

        try {
          const stream = chat({
            ...adapterOptions,
            tools: config.tools,
            modelOptions: config.modelOptions,
            ...(config.outputSchema && { outputSchema: config.outputSchema }),
            ...(config.stream === false && { stream: false }),
            systemPrompts: ['You are a helpful assistant for a guitar store.'],
            agentLoopStrategy: maxIterations(5),
            messages,
            abortController,
          })

          if (config.stream === false) {
            const result = await stream
            return new Response(JSON.stringify({ result }), {
              headers: { 'Content-Type': 'application/json' },
            })
          }

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          return new Response(JSON.stringify({ error: error.message || 'An error occurred' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
