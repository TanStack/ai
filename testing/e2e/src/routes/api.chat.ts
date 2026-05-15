import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  chat,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { Feature, Provider } from '@/lib/types'
import type { StreamChunk } from '@tanstack/ai'
import { createTextAdapter } from '@/lib/providers'
import { featureConfigs } from '@/lib/features'
import { guitarRecommendationSchema } from '@/lib/schemas'

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

        const config = featureConfigs[feature]
        const modelOverride = config.modelOverrides?.[provider]
        const adapterOptions = createTextAdapter(
          provider,
          modelOverride,
          aimockPort,
          testId,
        )

        try {
          // The `one-shot-text` feature exists to verify the wire-level
          // non-streaming path (issue #557): `chat({ stream: false })` must
          // call `adapter.chatNonStreaming()` and send `stream: false` to
          // the upstream provider — not stream-then-concatenate. Wrap the
          // resulting Promise<string> in a single SSE lifecycle so the
          // client (which always uses `fetchServerSentEvents`) renders it
          // identically to the streaming case.
          if (feature === 'one-shot-text') {
            const text = await chat({
              ...adapterOptions,
              modelOptions: config.modelOptions,
              systemPrompts: [
                'You are a helpful assistant for a guitar store.',
              ],
              messages,
              abortController,
              stream: false,
            })

            const oneShotStream =
              (async function* (): AsyncGenerator<StreamChunk> {
                const messageId = `oneshot-${Date.now()}`
                const runId = `oneshot-run-${Date.now()}`
                const threadId = `oneshot-thread-${Date.now()}`
                yield {
                  type: EventType.RUN_STARTED,
                  runId,
                  threadId,
                  model: adapterOptions.adapter.model,
                  timestamp: Date.now(),
                }
                yield {
                  type: EventType.TEXT_MESSAGE_START,
                  messageId,
                  role: 'assistant',
                  model: adapterOptions.adapter.model,
                  timestamp: Date.now(),
                }
                yield {
                  type: EventType.TEXT_MESSAGE_CONTENT,
                  messageId,
                  delta: text,
                  model: adapterOptions.adapter.model,
                  timestamp: Date.now(),
                }
                yield {
                  type: EventType.TEXT_MESSAGE_END,
                  messageId,
                  model: adapterOptions.adapter.model,
                  timestamp: Date.now(),
                }
                yield {
                  type: EventType.RUN_FINISHED,
                  runId,
                  threadId,
                  model: adapterOptions.adapter.model,
                  timestamp: Date.now(),
                  finishReason: 'stop',
                }
              })()

            return toServerSentEventsResponse(oneShotStream, {
              abortController,
            })
          }

          const stream =
            feature === 'structured-output-stream'
              ? chat({
                  ...adapterOptions,
                  modelOptions: config.modelOptions,
                  systemPrompts: [
                    'You are a helpful assistant for a guitar store.',
                  ],
                  messages,
                  outputSchema: guitarRecommendationSchema,
                  stream: true,
                  abortController,
                })
              : chat({
                  ...adapterOptions,
                  tools: config.tools,
                  modelOptions: config.modelOptions,
                  systemPrompts: [
                    'You are a helpful assistant for a guitar store.',
                  ],
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
