import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  EventType,
  toServerSentEventsResponse,
  toolDefinition,
} from '@tanstack/ai'
import {
  openRouterResponsesText,
  openRouterText,
} from '@tanstack/ai-openrouter'
import { z } from 'zod'
import type { ChatMiddleware, StreamChunk } from '@tanstack/ai'

/**
 * Live confirmation page for OpenRouter native combined mode:
 * `chat({ tools, outputSchema, stream: true })` must stay on `chatStream`
 * and must not call `structuredOutputStream`.
 */

export const CitySchema = z.object({
  city: z.string().describe('City name'),
  code: z.string().describe('Short 3-letter city code from the tool'),
  summary: z.string().describe('One sentence that uses the city and the code'),
})

export type CityResult = z.infer<typeof CitySchema>

const lookupCityCode = toolDefinition({
  name: 'lookup_city_code',
  description: 'Return a short 3-letter code for a city',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ code: z.string() }),
}).server(async ({ city }) => ({
  code: city.slice(0, 3).toUpperCase(),
}))

const PROVIDERS = ['openrouter', 'openrouter-responses'] as const
type Provider = (typeof PROVIDERS)[number]

const MODELS = [
  'openai/gpt-5.5',
  'anthropic/claude-sonnet-4.6',
  'google/gemini-3.5-flash',
  'x-ai/grok-4.5',
] as const
export type CombinedModel = (typeof MODELS)[number]

export const COMBINED_MODELS: ReadonlyArray<{
  value: CombinedModel
  label: string
}> = [
  { value: 'openai/gpt-5.5', label: 'OpenAI GPT-5.5' },
  { value: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { value: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { value: 'x-ai/grok-4.5', label: 'Grok 4.5' },
]

function isProvider(value: unknown): value is Provider {
  return value === 'openrouter' || value === 'openrouter-responses'
}

function isModel(value: unknown): value is CombinedModel {
  return typeof value === 'string' && MODELS.some((model) => model === value)
}

export type CombinedModeStats = {
  supportsCombined: boolean
  chatStreamCalls: number
  chatStreamWithSchema: number
  structuredOutputStreamCalls: number
  structuredOutputCalls: number
  nativeCombined: boolean
}

/**
 * Count adapter entry points so the UI can prove native combined mode:
 * schema rides on `chatStream`, and `structuredOutputStream` stays at 0.
 *
 * Infer T from one concrete adapter (Chat Completions or Responses). A union
 * of those two classes made the wrapper `options` parameter implicit `any`.
 */
function instrumentAdapter<
  T extends {
    model: string
    chatStream: (options: never) => AsyncIterable<StreamChunk>
    structuredOutputStream?: (options: never) => AsyncIterable<StreamChunk>
    structuredOutput: (options: never) => Promise<unknown>
    supportsCombinedToolsAndSchema: () => boolean
  },
>(adapter: T): { adapter: T; snapshot: () => CombinedModeStats } {
  const stats = {
    supportsCombined: adapter.supportsCombinedToolsAndSchema() === true,
    chatStreamCalls: 0,
    chatStreamWithSchema: 0,
    structuredOutputStreamCalls: 0,
    structuredOutputCalls: 0,
  }

  const origChatStream = adapter.chatStream.bind(adapter)
  adapter.chatStream = (options: { outputSchema?: unknown }) => {
    stats.chatStreamCalls += 1
    if (options.outputSchema) {
      stats.chatStreamWithSchema += 1
    }
    return origChatStream(options as never)
  }

  const origStructuredStream = adapter.structuredOutputStream?.bind(adapter)
  if (origStructuredStream) {
    adapter.structuredOutputStream = (options: never) => {
      stats.structuredOutputStreamCalls += 1
      return origStructuredStream(options)
    }
  }

  const origStructured = adapter.structuredOutput.bind(adapter)
  adapter.structuredOutput = (options: never) => {
    stats.structuredOutputCalls += 1
    return origStructured(options)
  }

  return {
    adapter,
    snapshot: () => ({
      ...stats,
      nativeCombined:
        stats.supportsCombined &&
        stats.structuredOutputStreamCalls === 0 &&
        stats.structuredOutputCalls === 0 &&
        stats.chatStreamWithSchema > 0,
    }),
  }
}

function phaseCounterMiddleware(): {
  middleware: ChatMiddleware
  snapshot: () => Record<string, number>
} {
  const counts: Record<string, number> = {}
  return {
    middleware: {
      name: 'phase-counter',
      onChunk(ctx) {
        counts[ctx.phase] = (counts[ctx.phase] ?? 0) + 1
      },
    },
    snapshot: () => ({ ...counts }),
  }
}

async function* withTrailingDiagnostics(
  stream: AsyncIterable<StreamChunk>,
  combinedSnapshot: () => CombinedModeStats,
  phaseSnapshot: () => Record<string, number>,
  model: string,
): AsyncIterable<StreamChunk> {
  let yielded = false
  for await (const chunk of stream) {
    if (
      chunk.type === EventType.RUN_FINISHED ||
      chunk.type === EventType.RUN_ERROR
    ) {
      yielded = true
      yield {
        type: EventType.CUSTOM,
        name: 'combined-mode',
        value: combinedSnapshot(),
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.CUSTOM,
        name: 'phase-counts',
        value: phaseSnapshot(),
        model,
        timestamp: Date.now(),
      }
    }
    yield chunk
  }
  if (!yielded) {
    yield {
      type: EventType.CUSTOM,
      name: 'combined-mode',
      value: combinedSnapshot(),
      model,
      timestamp: Date.now(),
    }
    yield {
      type: EventType.CUSTOM,
      name: 'phase-counts',
      value: phaseSnapshot(),
      model,
      timestamp: Date.now(),
    }
  }
}

export const Route = createFileRoute('/api/openrouter-combined')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        const onAbort = () => abortController.abort()
        request.signal.addEventListener('abort', onAbort, { once: true })
        if (request.signal.aborted) {
          onAbort()
        }

        let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        try {
          const provider: Provider = isProvider(params.forwardedProps.provider)
            ? params.forwardedProps.provider
            : 'openrouter'
          const model: CombinedModel = isModel(params.forwardedProps.model)
            ? params.forwardedProps.model
            : 'openai/gpt-5.5'

          const { adapter, snapshot: combinedSnapshot } =
            provider === 'openrouter-responses'
              ? instrumentAdapter(openRouterResponsesText(model))
              : instrumentAdapter(openRouterText(model))
          const counter = phaseCounterMiddleware()

          const streamIterable = chat({
            adapter,
            messages: params.messages,
            tools: [lookupCityCode],
            outputSchema: CitySchema,
            stream: true,
            middleware: [counter.middleware],
            threadId: params.threadId,
            runId: params.runId,
            abortController,
          }) as AsyncIterable<StreamChunk>

          const withDiagnostics = withTrailingDiagnostics(
            streamIterable,
            combinedSnapshot,
            counter.snapshot,
            adapter.model,
          )

          return toServerSentEventsResponse(withDiagnostics, {
            abortController,
          })
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'An error occurred'
          console.error('[api/openrouter-combined] Error:', error)
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        } finally {
          request.signal.removeEventListener('abort', onAbort)
        }
      },
    },
  },
})
