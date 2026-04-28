import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsStream } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import { zaiText } from '@tanstack/ai-zai'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import { productTools } from '@/lib/tools/product-tools'

type Provider = 'anthropic' | 'openai' | 'gemini' | 'zai'

function getAdapter(provider: Provider, model?: string): AnyTextAdapter {
  switch (provider) {
    case 'openai':
      return openaiText((model || 'gpt-4o') as 'gpt-4o')
    case 'gemini':
      return geminiText((model || 'gemini-2.5-flash') as 'gemini-2.5-flash')
    case 'zai':
      return zaiText((model || 'glm-4.7') as 'glm-4.7')
    case 'anthropic':
    default:
      return anthropicText((model || 'claude-haiku-4-5') as 'claude-haiku-4-5')
  }
}

export const Route = createFileRoute('/_home/api/product-regular')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        const body = await request.json()
        const { messages, data } = body

        const provider: Provider = data?.provider || 'anthropic'
        const model: string | undefined = data?.model

        const adapter = getAdapter(provider, model)
        const baseChatStream = adapter.chatStream.bind(adapter)
        let llmCallCount = 0
        let totalContextBytes = 0
        const textEncoder = new TextEncoder()

        const instrumentedAdapter: AnyTextAdapter = {
          ...adapter,
          chatStream: (options) => {
            llmCallCount += 1
            let contextBytes = 0
            try {
              contextBytes = textEncoder.encode(
                JSON.stringify(options.messages ?? []),
              ).length
            } catch {
              contextBytes = 0
            }
            totalContextBytes += contextBytes
            const averageContextBytes =
              llmCallCount > 0
                ? Math.round(totalContextBytes / llmCallCount)
                : 0
            const stream = baseChatStream(options)
            async function* instrumentedStream(): AsyncGenerator<StreamChunk> {
              yield {
                type: 'CUSTOM',
                model: adapter.model,
                timestamp: Date.now(),
                name: 'product_regular:llm_call',
                value: {
                  count: llmCallCount,
                  contextBytes,
                  totalContextBytes,
                  averageContextBytes,
                },
              } as StreamChunk
              for await (const chunk of stream) {
                yield chunk
              }
            }
            return instrumentedStream()
          },
        }

        try {
          const stream = chat({
            adapter: instrumentedAdapter,
            messages,
            tools: [...productTools],
            systemPrompts: [
              `You are an assistant for a shoe product catalog. You have access to tools to query products. Use the tools to answer questions about the product catalog. You MUST use the tools — do not make up product data.`,
            ],
            agentLoopStrategy: maxIterations(30),
            abortController,
            maxTokens: 8192,
          })

          const requestStartTimeMs = Date.now()
          const instrumentedStream =
            (async function* (): AsyncGenerator<StreamChunk> {
              yield {
                type: 'CUSTOM',
                model: adapter.model,
                timestamp: requestStartTimeMs,
                name: 'product_regular:chat_start',
                value: { startTimeMs: requestStartTimeMs },
              } as StreamChunk
              for await (const chunk of stream) {
                if (chunk.type === 'RUN_FINISHED') {
                  const endTimeMs = Date.now()
                  yield {
                    type: 'CUSTOM',
                    model: adapter.model,
                    timestamp: endTimeMs,
                    name: 'product_regular:chat_end',
                    value: {
                      endTimeMs,
                      durationMs: endTimeMs - requestStartTimeMs,
                    },
                  } as StreamChunk
                }
                yield chunk
              }
            })()

          const sseStream = toServerSentEventsStream(
            instrumentedStream,
            abortController,
          )

          return new Response(sseStream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          })
        } catch (error: unknown) {
          console.error('[API Product Regular] Error:', error)

          if (
            (error instanceof Error && error.name === 'AbortError') ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }

          return new Response(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : 'An error occurred',
            }),
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
