import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
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
        const previousInteractionId: string | undefined =
          typeof fp.previousInteractionId === 'string'
            ? fp.previousInteractionId
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

          // Test-only flag — when set to `true`, the route passes
          // structured root-level observability `metadata` (objects,
          // arrays) to `chat()`. Enables root-metadata-wire.spec.ts to
          // verify the call still completes: the adapter keeps root
          // metadata off the provider request, so the OpenRouter SDK's
          // Record<string, string> outbound validation never sees it
          // (regression coverage for #735). Wire-absence itself is
          // asserted by the adapter unit tests.
          const rootObservabilityMetadata =
            fp.structuredRootMetadata === true
              ? {
                  observationName: 'e2e-root-metadata',
                  tags: ['a', 'b'],
                  prompt: { name: 'p', version: 1 },
                }
              : undefined

          // Two structured-output-streaming features differ only in which
          // schema they bind to. Branched per-feature so TS can pick the
          // right `chat<TSchema>()` overload without a `never` cast.
          const stream =
            feature === 'structured-output-stream'
              ? chat({
                  ...adapterOptions,
                  modelOptions,
                  systemPrompts,
                  messages: params.messages,
                  threadId: params.threadId,
                  runId: params.runId,
                  ...(params.parentRunId && { parentRunId: params.parentRunId }),
                  ...(params.resume && { resume: params.resume }),
                  outputSchema: guitarRecommendationSchema,
                  stream: true,
                  abortController,
                })
              : feature === 'multi-turn-structured'
                ? chat({
                    ...adapterOptions,
                    modelOptions,
                    systemPrompts,
                    messages: params.messages,
                    threadId: params.threadId,
                    runId: params.runId,
                    ...(params.parentRunId && { parentRunId: params.parentRunId }),
                    ...(params.resume && { resume: params.resume }),
                    outputSchema: recipeSchema,
                    stream: true,
                    abortController,
                  })
                : feature === 'agentic-structured-stream'
                  ? chat({
                      ...adapterOptions,
                      tools: config.tools,
                      modelOptions,
                      systemPrompts,
                      agentLoopStrategy: maxIterations(5),
                      messages: params.messages,
                      threadId: params.threadId,
                      runId: params.runId,
                      ...(params.parentRunId && { parentRunId: params.parentRunId }),
                      ...(params.resume && { resume: params.resume }),
                      outputSchema: guitarRecommendationSchema,
                      stream: true,
                      abortController,
                    })
                  : chat({
                      ...adapterOptions,
                      tools: config.tools,
                      modelOptions,
                      systemPrompts,
                      agentLoopStrategy: maxIterations(5),
                      messages: params.messages,
                      threadId: params.threadId,
                      runId: params.runId,
                      ...(params.parentRunId && { parentRunId: params.parentRunId }),
                      ...(params.resume && { resume: params.resume }),
                      ...(rootObservabilityMetadata && {
                        metadata: rootObservabilityMetadata,
                      }),
                      abortController,
                    })

          // Cast: `chat()` returns `AsyncIterable<StreamChunk> |
          // StructuredOutputStream<T>`. Both yield AG-UI events at runtime
          // but the typed-CUSTOM-events variants on `StructuredOutputStream`
          // aren't structurally assignable to the bare `StreamChunk` union
          // (zod-passthrough index-signature variance). The runtime is fine
          // either way.
          return toServerSentEventsResponse(
            stream as AsyncIterable<StreamChunk>,
            { abortController },
          )
        } catch (error) {
          console.error('[api.chat] Error:', error)
          if (
            (error instanceof Error && error.name === 'AbortError') ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }
          const message =
            error instanceof Error ? error.message : 'An error occurred'
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
