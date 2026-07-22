import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  createChatOptions,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { memoryMiddleware } from '@tanstack/ai-memory'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { grokText } from '@tanstack/ai-grok'
import { openaiText } from '@tanstack/ai-openai'
import { ollamaText } from '@tanstack/ai-ollama'
import { openRouterText } from '@tanstack/ai-openrouter'
import { lastRecallBySession, memoryAdapter } from '@/lib/memory-store'
import type { Provider } from '@/lib/model-selection'

const SYSTEM_PROMPT = `You are a helpful, friendly assistant with long-term memory.

Earlier facts the user shared may be injected into your system prompt under a
"memory" heading. When they are, use them to answer — for example, if the user
tells you their name in one turn and asks for it in a later turn, recall it from
memory rather than saying you don't know.`

/**
 * Chat endpoint for the `/memory` demo. Identical in spirit to `/api/chat`,
 * minus the guitar tools and trace recording, plus a `memoryMiddleware` wired
 * to the shared {@link memoryAdapter} singleton so recall/save persist across
 * requests. The middleware is built per request with a static scope derived
 * from the client-supplied `sessionId`.
 */
export const Route = createFileRoute('/api/memory-chat')({
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
        const sessionId: string = data.sessionId || 'panel-default-session'

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

          console.log(
            `>> memory chat: model ${model} on ${provider} (session ${sessionId})`,
          )

          const memory = memoryMiddleware({
            adapter: memoryAdapter,
            scope: { sessionId },
            onRecall: (info) => {
              lastRecallBySession.set(sessionId, info.result)
            },
          })

          const stream = chat({
            ...options,
            adapter,
            tools: [],
            systemPrompts: [SYSTEM_PROMPT],
            middleware: [memory],
            agentLoopStrategy: maxIterations(5),
            messages,
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          console.error('[api.memory-chat] Error:', error?.message)
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
