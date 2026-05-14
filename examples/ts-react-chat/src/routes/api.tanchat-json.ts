import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  createChatOptions,
  maxIterations,
  toJSONResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { ollamaText } from '@tanstack/ai-ollama'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { openRouterText } from '@tanstack/ai-openrouter'
import { grokText } from '@tanstack/ai-grok'
import { groqText } from '@tanstack/ai-groq'
import type { AnyTextAdapter } from '@tanstack/ai'
import {
  addToCartToolDef,
  addToWishListToolDef,
  calculateFinancing,
  compareGuitars,
  getGuitars,
  getPersonalGuitarPreferenceToolDef,
  recommendGuitarToolDef,
  searchGuitars,
} from '@/lib/guitar-tools'

// Companion to /api/tanchat that returns the full chat as a single JSON
// array via toJSONResponse(stream). Use this when the target runtime can't
// emit a streaming Response — e.g. Expo's @expo/server, certain Cloudflare
// or edge proxy setups. Pair with fetchJSON('/api/tanchat-json') on the
// client. Trade-off: the UI sees nothing until the request resolves.

type Provider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'grok'
  | 'groq'
  | 'openrouter'

const SYSTEM_PROMPT = `You are a helpful assistant for a guitar store.

When a user asks for a guitar recommendation:
1. FIRST: Use the getGuitars tool (no parameters needed)
2. SECOND: Use the recommendGuitar tool with the ID of the guitar you want to recommend
3. NEVER write a recommendation directly — ALWAYS use the recommendGuitar tool
`

const addToCartToolServer = addToCartToolDef.server((args) => ({
  success: true,
  cartId: 'CART_' + Date.now(),
  guitarId: args.guitarId,
  quantity: args.quantity,
  totalItems: args.quantity,
}))

export const Route = createFileRoute('/api/tanchat-json')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        const body = await request.json()
        const { messages, data } = body

        const provider: Provider = data?.provider || 'openai'
        const model: string = data?.model || 'gpt-4o'
        const conversationId: string | undefined = data?.conversationId

        const adapterConfig: Record<
          Provider,
          () => { adapter: AnyTextAdapter }
        > = {
          anthropic: () =>
            createChatOptions({
              adapter: anthropicText(
                (model || 'claude-sonnet-4-5') as 'claude-sonnet-4-5',
              ),
            }),
          openrouter: () =>
            createChatOptions({
              adapter: openRouterText('openai/gpt-5.1'),
            }),
          gemini: () =>
            createChatOptions({
              adapter: geminiText(
                (model || 'gemini-2.5-flash') as 'gemini-2.5-flash',
              ),
            }),
          grok: () =>
            createChatOptions({
              adapter: grokText((model || 'grok-3') as 'grok-3'),
            }),
          groq: () =>
            createChatOptions({
              adapter: groqText(
                (model ||
                  'llama-3.3-70b-versatile') as 'llama-3.3-70b-versatile',
              ),
            }),
          ollama: () =>
            createChatOptions({
              adapter: ollamaText((model || 'gpt-oss:120b') as 'gpt-oss:120b'),
            }),
          openai: () =>
            createChatOptions({
              adapter: openaiText((model || 'gpt-4o') as 'gpt-4o'),
            }),
        }

        try {
          const options = adapterConfig[provider]()

          const stream = chat({
            ...options,
            tools: [
              getGuitars,
              recommendGuitarToolDef,
              addToCartToolServer,
              addToWishListToolDef,
              getPersonalGuitarPreferenceToolDef,
              compareGuitars,
              calculateFinancing,
              searchGuitars,
            ],
            systemPrompts: [SYSTEM_PROMPT],
            agentLoopStrategy: maxIterations(20),
            messages,
            abortController,
            conversationId,
          })

          // The only difference from /api/tanchat: the entire stream is
          // drained and serialised as a JSON array instead of an SSE stream.
          return toJSONResponse(stream, { abortController })
        } catch (error: any) {
          console.error('[api.tanchat-json] Error in chat request:', {
            message: error?.message,
            name: error?.name,
            status: error?.status,
            stack: error?.stack,
          })
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          return new Response(
            JSON.stringify({
              error: error.message || 'An error occurred',
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
