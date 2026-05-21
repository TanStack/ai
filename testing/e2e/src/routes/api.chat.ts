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
import { guitarRecommendationSchema, recipeSchema } from '@/lib/schemas'

const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant for a guitar store.'

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
          const systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT

          // Test-only flag — when truthy, the route promotes the system
          // prompt to object-form and attaches Anthropic `cache_control`
          // metadata. Enables system-prompt-metadata.spec.ts to verify
          // cache_control reaches the wire via the aimock journal.
          const systemPromptCacheControl =
            fp.systemPromptCacheControl === true
              ? ({ type: 'ephemeral' as const } as const)
              : undefined
          const systemPrompts = systemPromptCacheControl
            ? [
                {
                  content: systemPrompt,
                  metadata: { cache_control: systemPromptCacheControl },
                  // The route is provider-generic; the metadata type is
                  // adapter-narrowed and only meaningful for Anthropic, so
                  // a single bridge cast lives here at the test entry.
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
              ]
            : [systemPrompt]

          // Two structured-output-streaming features differ only in which
          // schema they bind to. Branched per-feature so TS can pick the
          // right `chat<TSchema>()` overload without a `never` cast.
          const stream =
            feature === 'structured-output-stream'
              ? chat({
                  ...adapterOptions,
                  modelOptions: config.modelOptions,
                  systemPrompts,
                  messages: params.messages,
                  threadId: params.threadId,
                  runId: params.runId,
                  outputSchema: guitarRecommendationSchema,
                  stream: true,
                  abortController,
                })
              : feature === 'multi-turn-structured'
                ? chat({
                    ...adapterOptions,
                    modelOptions: config.modelOptions,
                    systemPrompts,
                    messages: params.messages,
                    threadId: params.threadId,
                    runId: params.runId,
                    outputSchema: recipeSchema,
                    stream: true,
                    abortController,
                  })
                : chat({
                    ...adapterOptions,
                    tools: config.tools,
                    modelOptions: config.modelOptions,
                    systemPrompts,
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
