import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsStream } from '@tanstack/ai'
import { createCodeModeToolAndPrompt } from '@tanstack/ai-code-mode'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import { productTools } from '@/lib/tools/product-tools'

type Provider = 'anthropic' | 'openai' | 'gemini'

function getAdapter(provider: Provider, model?: string): AnyTextAdapter {
  switch (provider) {
    case 'openai':
      return openaiText((model || 'gpt-4o') as 'gpt-4o')
    case 'gemini':
      return geminiText((model || 'gemini-2.5-flash') as 'gemini-2.5-flash')
    case 'anthropic':
    default:
      return anthropicText(
        (model || 'claude-haiku-4-5') as 'claude-haiku-4-5',
      )
  }
}

const PRODUCT_CODE_MODE_SYSTEM_PROMPT = `You are an analytical assistant for a shoe product catalog. You can execute TypeScript code to query the product API and compute answers.

## Available External APIs (inside execute_typescript)

- \`external_getProductListPageCount()\` — Returns { pageCount: number } (total pages of product listings)
- \`external_getProductListPage({ page })\` — Returns { productIds: string[] } (10 product IDs per page, 1-based)
- \`external_getProductByID({ id })\` — Returns full product details: { id, name, brand, price, category, color, sizeRange }

## Strategy

The product API is paginated. To get all products:
1. Get the page count
2. Fetch all pages to get all product IDs
3. Fetch each product by ID
4. Compute the answer from the full dataset

Always write efficient code that does all of this in a single execution — use Promise.all to parallelize fetches.`

let codeModeCache: {
  tool: ReturnType<typeof createCodeModeToolAndPrompt>['tool']
  systemPrompt: string
} | null = null

async function getCodeModeTools() {
  if (!codeModeCache) {
    const { createNodeIsolateDriver } = await import(
      '@tanstack/ai-isolate-node'
    )
    const { tool, systemPrompt } = createCodeModeToolAndPrompt({
      driver: createNodeIsolateDriver(),
      tools: productTools,
      timeout: 60000,
      memoryLimit: 128,
    })
    codeModeCache = { tool, systemPrompt }
  }
  return codeModeCache
}

export const Route = createFileRoute('/api/product-codemode')({
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
                name: 'product_codemode:llm_call',
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

        const { tool, systemPrompt } = await getCodeModeTools()

        try {
          const stream = chat({
            adapter: instrumentedAdapter,
            messages,
            tools: [tool],
            systemPrompts: [PRODUCT_CODE_MODE_SYSTEM_PROMPT, systemPrompt],
            agentLoopStrategy: maxIterations(15),
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
                name: 'product_codemode:chat_start',
                value: { startTimeMs: requestStartTimeMs },
              } as StreamChunk
              for await (const chunk of stream) {
                if (chunk.type === 'RUN_FINISHED') {
                  const endTimeMs = Date.now()
                  yield {
                    type: 'CUSTOM',
                    model: adapter.model,
                    timestamp: endTimeMs,
                    name: 'product_codemode:chat_end',
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
          console.error('[API Product Code Mode] Error:', error)

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
