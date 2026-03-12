import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsStream } from '@tanstack/ai'
import { createCodeModeToolAndPrompt } from '@tanstack/ai-code-mode'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

import { databaseTools } from '@/lib/tools/database-tools'

type Provider = 'anthropic' | 'openai' | 'gemini'

function getAdapter(provider: Provider, model?: string): AnyTextAdapter {
  switch (provider) {
    case 'openai':
      return openaiText((model || 'gpt-4o') as 'gpt-4o')
    case 'gemini':
      return geminiText((model || 'gemini-2.5-flash') as 'gemini-2.5-flash')
    case 'anthropic':
    default:
      return anthropicText((model || 'claude-haiku-4-5') as 'claude-haiku-4-5')
  }
}

const DATABASE_DEMO_SYSTEM_PROMPT = `You are a helpful data analyst assistant with access to an in-memory database containing three tables: customers, products, and purchases.

## Available Tools

You have two tools to work with:

1. **getSchemaInfo** — Get the schema (column names and types) and row counts for one or all tables. Call this first if you're unsure what columns are available.

2. **queryTable** — Query any table with optional filtering, column selection, sorting, and limiting. Supports exact-match \`where\` conditions.

## Tables Overview

- **customers** — Customer records (id, name, email, city, joined)
- **products** — Product catalog (id, name, category, price, stock)
- **purchases** — Purchase records linking customers to products (id, customer_id, product_id, quantity, total, purchased_at)

## Strategy

- For questions that need data from multiple tables, make multiple queryTable calls and join the data yourself.
- For aggregation (sums, averages, counts), query the raw data and compute the result.
- Always present results clearly, using tables or lists when appropriate.
- If a question is ambiguous, make reasonable assumptions and state them.`

// Lazy initialization
let codeModeCache: {
  tool: ReturnType<typeof createCodeModeToolAndPrompt>['tool']
  systemPrompt: string
} | null = null

async function getCodeModeTools() {
  if (!codeModeCache) {
    const { createIsolateDriver } = await import('@/lib/create-isolate-driver')
    const driver = await createIsolateDriver('node')
    const { tool, systemPrompt } = createCodeModeToolAndPrompt({
      driver,
      tools: databaseTools,
      timeout: 60000,
      memoryLimit: 128,
    })
    codeModeCache = { tool, systemPrompt }
  }
  return codeModeCache
}

// --- Instrumentation helpers ---

function instrumentAdapter(adapter: AnyTextAdapter): {
  adapter: AnyTextAdapter
} {
  const baseChatStream = adapter.chatStream.bind(adapter)
  let llmCallCount = 0
  let totalContextBytes = 0
  const textEncoder = new TextEncoder()

  const instrumented: AnyTextAdapter = {
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
        llmCallCount > 0 ? Math.round(totalContextBytes / llmCallCount) : 0
      const stream = baseChatStream(options)
      async function* instrumentedStream(): AsyncGenerator<StreamChunk> {
        yield {
          type: 'CUSTOM',
          model: adapter.model,
          timestamp: Date.now(),
          name: 'db_demo:llm_call',
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

  return { adapter: instrumented }
}

function wrapWithTimingEvents(
  stream: AsyncGenerator<StreamChunk>,
  adapter: AnyTextAdapter,
): AsyncGenerator<StreamChunk> {
  const requestStartTimeMs = Date.now()
  return (async function* (): AsyncGenerator<StreamChunk> {
    yield {
      type: 'CUSTOM',
      model: adapter.model,
      timestamp: requestStartTimeMs,
      name: 'db_demo:chat_start',
      value: { startTimeMs: requestStartTimeMs },
    } as StreamChunk
    for await (const chunk of stream) {
      if (chunk.type === 'RUN_FINISHED') {
        const endTimeMs = Date.now()
        yield {
          type: 'CUSTOM',
          model: adapter.model,
          timestamp: endTimeMs,
          name: 'db_demo:chat_end',
          value: {
            endTimeMs,
            durationMs: endTimeMs - requestStartTimeMs,
          },
        } as StreamChunk
      }
      yield chunk
    }
  })()
}

export const Route = createFileRoute(
  '/_database-demo/api/database-demo' as any,
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestSignal = request.signal
        if (requestSignal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        const body = await request.json()
        const { messages, data } = body

        const provider: Provider = data?.provider || 'anthropic'
        const model: string | undefined = data?.model
        const useCodeMode: boolean = data?.useCodeMode !== false

        const rawAdapter = getAdapter(provider, model)
        const { adapter: instrumentedAdapter } = instrumentAdapter(rawAdapter)

        try {
          let tools
          let systemPrompts

          if (useCodeMode) {
            const { tool, systemPrompt } = await getCodeModeTools()
            tools = [tool]
            systemPrompts = [DATABASE_DEMO_SYSTEM_PROMPT, systemPrompt]
          } else {
            tools = [...databaseTools]
            systemPrompts = [DATABASE_DEMO_SYSTEM_PROMPT]
          }

          const stream = chat({
            adapter: instrumentedAdapter,
            messages,
            tools,
            systemPrompts,
            agentLoopStrategy: maxIterations(15),
            abortController,
            maxTokens: 8192,
          })

          const instrumentedStream = wrapWithTimingEvents(stream, rawAdapter)
          const sseStream = toServerSentEventsStream(instrumentedStream, abortController)

          return new Response(sseStream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          })
        } catch (error: unknown) {
          console.error('[API Database Demo Route] Error:', error)

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
