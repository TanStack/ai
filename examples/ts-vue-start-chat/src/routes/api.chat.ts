import { createFileRoute } from '@tanstack/vue-router'
import {
  chat,
  createChatOptions,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { ollamaText } from '@tanstack/ai-ollama'
import type { AnyTextAdapter } from '@tanstack/ai'
import { guitars } from '@/data/guitars'
import {
  addToCartToolDef,
  addToWishListToolDef,
  getGuitarsToolDef,
  getPersonalGuitarPreferenceToolDef,
  recommendGuitarToolDef,
} from '@/lib/guitar-tools'

type Provider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

const SYSTEM_PROMPT = `You are a helpful assistant for a guitar store.

CRITICAL INSTRUCTIONS - YOU MUST FOLLOW THIS EXACT WORKFLOW:

When a user asks for a guitar recommendation:
1. FIRST: Use the getGuitars tool (no parameters needed)
2. SECOND: Use the recommendGuitar tool with the ID of the guitar you want to recommend
3. NEVER write a recommendation directly - ALWAYS use the recommendGuitar tool

IMPORTANT:
- The recommendGuitar tool will display the guitar in a special, appealing format
- You MUST use recommendGuitar for ANY guitar recommendation
- ONLY recommend guitars from our inventory (use getGuitars first)
- The recommendGuitar tool has a buy button - this is how customers purchase
- Do NOT describe the guitar yourself - let the recommendGuitar tool do it
`

const getGuitars = getGuitarsToolDef.server(() => guitars)

const addToCartToolServer = addToCartToolDef.server((args) => ({
  success: true,
  cartId: 'CART_' + Date.now(),
  guitarId: args.guitarId,
  quantity: args.quantity,
  totalItems: args.quantity,
}))

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Capture request signal before reading body (it may be aborted after body is consumed)
        const requestSignal = request.signal

        if (requestSignal?.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()

        const { messages, data } = await request.json()
        const provider: Provider = data?.provider || 'openai'
        const model: string | undefined = data?.model
        const conversationId: string | undefined = data?.conversationId

        // Pre-define typed adapter configurations with full type inference
        // Model is passed to the adapter factory function for type-safe autocomplete
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
          gemini: () =>
            createChatOptions({
              adapter: geminiText(
                (model || 'gemini-2.5-flash') as 'gemini-2.5-flash',
              ),
            }),
          ollama: () =>
            createChatOptions({
              adapter: ollamaText((model || 'mistral:7b') as 'mistral:7b'),
            }),
          openai: () =>
            createChatOptions({
              adapter: openaiText((model || 'gpt-4o') as 'gpt-4o'),
            }),
        }

        try {
          // Get typed adapter options using createChatOptions pattern
          const options = adapterConfig[provider]()

          const stream = chat({
            ...options,
            tools: [
              getGuitars,
              recommendGuitarToolDef,
              addToCartToolServer,
              addToWishListToolDef,
              getPersonalGuitarPreferenceToolDef,
            ],
            systemPrompts: [SYSTEM_PROMPT],
            agentLoopStrategy: maxIterations(20),
            messages,
            abortController,
            conversationId,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          console.error('[API Route] Error in chat request:', error)

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
