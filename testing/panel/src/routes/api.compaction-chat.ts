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
import { recordCompaction } from '@/lib/compaction-store'
import type { AnyTextAdapter, ModelMessage } from '@tanstack/ai'
import type { Provider } from '@/lib/model-selection'

// Provider-agnostic summary: one throwaway chat() turn on the same adapter.
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
 * Chat endpoint for the `/compaction` demo. Wires `withCompaction` with a small
 * `maxTokens` so the middleware fires after a couple of turns. Compaction here
 * evicts the oldest messages (no `summarize` callback), keeping the recent tail
 * verbatim; each event is recorded so the page can show before/after tokens.
 *
 * `threadId` scopes the recorded events; it is demo-only (never trust a
 * client-supplied identity in production).
 */
export const Route = createFileRoute('/api/compaction-chat')({
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
        const threadId: string =
          typeof data.threadId === 'string' && data.threadId.length > 0
            ? data.threadId
            : 'panel-default-thread'
        const maxTokens: number =
          typeof data.maxTokens === 'number' && data.maxTokens > 0
            ? data.maxTokens
            : 400
        const strategyName: 'evict' | 'summarize' =
          data.strategy === 'summarize' ? 'summarize' : 'evict'

        try {
          const adapterConfig = {
            anthropic: () =>
              createChatOptions({
                adapter: anthropicText((model || 'claude-sonnet-4-5') as any),
              }),
            gemini: () =>
              createChatOptions({
                adapter: geminiText((model || 'gemini-2.5-flash') as any),
              }),
            grok: () =>
              createChatOptions({
                adapter: grokText((model || 'grok-build-0.1') as any),
              }),
            ollama: () =>
              createChatOptions({
                adapter: ollamaText((model || 'mistral:7b') as any),
              }),
            openai: () =>
              createChatOptions({
                adapter: openaiText((model || 'gpt-4o') as any),
              }),
            openrouter: () =>
              createChatOptions({
                adapter: openRouterText((model || 'openai/gpt-4o') as any),
              }),
          }

          const options = adapterConfig[provider]()
          const { adapter } = options

          const strategy =
            strategyName === 'summarize'
              ? summarizeOldest({
                  summarize: (msgs) => summarizeWith(adapter, msgs),
                })
              : evictOldest()

          const compaction = withCompaction({
            maxTokens,
            strategy,
            onCompact: (info) => recordCompaction(threadId, info),
          })

          const stream = chat({
            ...options,
            adapter,
            tools: [],
            systemPrompts: [SYSTEM_PROMPT],
            middleware: [compaction],
            agentLoopStrategy: maxIterations(5),
            messages,
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          console.error('[api.compaction-chat] Error:', error?.message)
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
