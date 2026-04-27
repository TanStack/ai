import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
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
        const provider: Provider = (
          typeof fp.provider === 'string' ? fp.provider : 'openai'
        ) as Provider
        const feature: Feature = (
          typeof fp.feature === 'string' ? fp.feature : 'chat'
        ) as Feature
        const testId = typeof fp.testId === 'string' ? fp.testId : undefined
        const aimockPort =
          fp.aimockPort != null ? Number(fp.aimockPort) : undefined

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
            messages: params.messages,
            threadId: params.threadId,
            runId: params.runId,
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
