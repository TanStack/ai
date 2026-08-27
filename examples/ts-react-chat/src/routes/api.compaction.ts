import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
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

/**
 * Chat endpoint for `/compaction`. Uses a small `maxTokens` so compaction
 * fires after a few turns. Stats ride the stream as `compaction:state`
 * CUSTOM events and show up in TanStack AI DevTools.
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
        const body = await request.json()
        const messages = body.messages
        const data = body.data || {}

        const provider: Provider = data.provider || 'openai'
        const model: string | undefined = data.model
        const maxTokens: number =
          typeof data.maxTokens === 'number' && data.maxTokens > 0
            ? data.maxTokens
            : 400
        const strategyName: 'evict' | 'summarize' =
          data.strategy === 'summarize' ? 'summarize' : 'evict'

        try {
          const adapterConfig: Partial<
            Record<Provider, () => { adapter: AnyTextAdapter }>
          > = {
            anthropic: () =>
              createChatOptions({
                adapter: anthropicText(
                  (model || 'claude-sonnet-4-6') as 'claude-sonnet-4-6',
                ),
              }),
            gemini: () =>
              createChatOptions({
                adapter: geminiText(
                  (model ||
                    'gemini-3.1-pro-preview') as 'gemini-3.1-pro-preview',
                ),
              }),
            grok: () =>
              createChatOptions({
                adapter: grokText(
                  (model || 'grok-build-0.1') as 'grok-build-0.1',
                ),
              }),
            ollama: () =>
              createChatOptions({
                adapter: ollamaText((model || 'mistral:7b') as 'mistral:7b'),
              }),
            openai: () =>
              createChatOptions({
                adapter: openaiText((model || 'gpt-5.5') as 'gpt-5.5'),
              }),
            openrouter: () =>
              createChatOptions({
                adapter: openRouterText(
                  (model || 'openai/gpt-5.1') as 'openai/gpt-5.1',
                ),
              }),
          }

          const makeOptions = adapterConfig[provider] ?? adapterConfig.openai
          if (!makeOptions) {
            return new Response(JSON.stringify({ error: 'Unknown provider' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            })
          }
          const options = makeOptions()
          const { adapter } = options

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
            messages,
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
