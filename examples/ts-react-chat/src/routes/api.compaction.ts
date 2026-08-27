import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  createChatOptions,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import {
  evictOldest,
  summarizeOldest,
  withCompaction,
} from '@tanstack/ai-compaction'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { grokText } from '@tanstack/ai-grok'
import { groqText } from '@tanstack/ai-groq'
import { openaiText } from '@tanstack/ai-openai'
import { ollamaText } from '@tanstack/ai-ollama'
import { openRouterText } from '@tanstack/ai-openrouter'
import type { AnyTextAdapter, ModelMessage } from '@tanstack/ai'
import type { Provider } from '@/lib/model-selection'

async function summarizeWith(
  adapter: AnyTextAdapter,
  messages: Array<ModelMessage>,
): Promise<string> {
  let text = ''
  for await (const chunk of chat({
    adapter,
    messages: [
      ...messages,
      {
        role: 'user',
        content: 'Summarize the conversation above in 3-4 sentences.',
      },
    ],
    agentLoopStrategy: maxIterations(1),
  })) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT') text += chunk.delta
  }
  return text
}

const SYSTEM_PROMPT = `You are a helpful assistant. Keep answers reasonably long
(a paragraph or two) so this demo's context fills up quickly.`

function adapterFor(provider: Provider, model: string): AnyTextAdapter {
  switch (provider) {
    case 'anthropic':
      return anthropicText(
        (model || 'claude-sonnet-4-6') as 'claude-sonnet-4-6',
      )
    case 'gemini':
      return geminiText(
        (model || 'gemini-3.1-pro-preview') as 'gemini-3.1-pro-preview',
      )
    case 'grok':
      return grokText((model || 'grok-build-0.1') as 'grok-build-0.1')
    case 'groq':
      return groqText((model || 'openai/gpt-oss-120b') as 'openai/gpt-oss-120b')
    case 'ollama':
      return ollamaText((model || 'mistral:7b') as 'mistral:7b')
    case 'openrouter':
      return openRouterText((model || 'openai/gpt-5.1') as 'openai/gpt-5.1')
    case 'openai':
    default:
      return openaiText((model || 'gpt-5.5') as 'gpt-5.5')
  }
}

/**
 * Chat endpoint for `/compaction`. Uses a small `maxTokens` so compaction
 * fires after a few turns. Keys come from `examples/ts-react-chat/.env`.
 */
export const Route = createFileRoute('/api/compaction')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestSignal = request.signal
        if (requestSignal.aborted) {
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

        const requestedProvider =
          typeof params.forwardedProps.provider === 'string'
            ? params.forwardedProps.provider
            : 'openai'
        const model: string =
          typeof params.forwardedProps.model === 'string'
            ? params.forwardedProps.model
            : 'gpt-5.5'
        const maxTokens: number =
          typeof params.forwardedProps.maxTokens === 'number' &&
          params.forwardedProps.maxTokens > 0
            ? params.forwardedProps.maxTokens
            : 400
        const strategyName: 'evict' | 'summarize' =
          params.forwardedProps.strategy === 'summarize' ? 'summarize' : 'evict'

        try {
          const provider: Provider = [
            'anthropic',
            'gemini',
            'grok',
            'groq',
            'ollama',
            'openai',
            'openrouter',
          ].includes(requestedProvider)
            ? (requestedProvider as Provider)
            : 'openai'

          const adapter = adapterFor(provider, model)
          const options = createChatOptions({ adapter })

          const strategy =
            strategyName === 'summarize'
              ? summarizeOldest({
                  summarize: (msgs) => summarizeWith(adapter, msgs),
                })
              : evictOldest()

          const stream = chat({
            ...options,
            adapter,
            tools: [],
            systemPrompts: [SYSTEM_PROMPT],
            middleware: [withCompaction({ maxTokens, strategy })],
            agentLoopStrategy: maxIterations(5),
            messages: params.messages,
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'An error occurred'
          console.error('[api.compaction] Error:', message)
          if (
            (error instanceof Error && error.name === 'AbortError') ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
