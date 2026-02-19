import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  createChatOptions,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { ollamaText } from '@tanstack/ai-ollama'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { openRouterText } from '@tanstack/ai-openrouter'
import { grokText } from '@tanstack/ai-grok'
import type { AnyTextAdapter } from '@tanstack/ai'
import {
  addToCartToolDef,
  addToWishListToolDef,
  getGuitars,
  getPersonalGuitarPreferenceToolDef,
  recommendGuitarToolDef,
} from '@/lib/guitar-tools'

type Provider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'grok'
  | 'openrouter'

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

Example workflow:
User: "I want an acoustic guitar"
Step 1: Call getGuitars()
Step 2: Call recommendGuitar(id: "6") 
Step 3: Done - do NOT add any text after calling recommendGuitar
`
const addToCartToolServer = addToCartToolDef.server((args) => ({
  success: true,
  cartId: 'CART_' + Date.now(),
  guitarId: args.guitarId,
  quantity: args.quantity,
  totalItems: args.quantity,
}))

export const Route = createFileRoute('/api/tanchat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Capture request signal before reading body (it may be aborted after body is consumed)
        const requestSignal = request.signal

        // If request is already aborted, return early
        if (requestSignal.aborted) {
          return new Response(null, { status: 499 }) // 499 = Client Closed Request
        }

        const abortController = new AbortController()

        const body = await request.json()
        const { messages, data } = body

        // Extract provider and model from data
        const provider: Provider = data?.provider || 'openai'
        const model: string = data?.model || 'gpt-4o'
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
          openrouter: () =>
            createChatOptions({
              adapter: openRouterText('openai/gpt-5.1'),
              modelOptions: {
                models: ['openai/chatgpt-4o-latest'],
                route: 'fallback',
                reasoning: {
                  effort: 'medium',
                },
              },
            }),
          gemini: () =>
            createChatOptions({
              adapter: geminiText(
                (model || 'gemini-2.5-flash') as 'gemini-2.5-flash',
              ),
              modelOptions: {
                thinkingConfig: {
                  includeThoughts: true,
                  thinkingBudget: 100,
                },
              },
            }),
          grok: () =>
            createChatOptions({
              adapter: grokText((model || 'grok-3') as 'grok-3'),
              modelOptions: {},
            }),
          ollama: () =>
            createChatOptions({
              adapter: ollamaText((model || 'gpt-oss:120b') as 'gpt-oss:120b'),
              modelOptions: { think: 'low', options: { top_k: 1 } },
            }),
          openai: () =>
            createChatOptions({
              adapter: openaiText((model || 'gpt-4o') as 'gpt-4o'),
              modelOptions: {},
            }),
        }

        try {
          // Get typed adapter options using createChatOptions pattern
          const options = adapterConfig[provider]()

          // Note: We cast to AsyncIterable<StreamChunk> because all chat adapters
          // return streams, but TypeScript sees a union of all possible return types
          const stream = chat({
            ...options,

            tools: [
              getGuitars, // Server tool
              recommendGuitarToolDef, // No server execute - client will handle
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
          console.error('[API Route] Error in chat request:', {
            message: error?.message,
            name: error?.name,
            status: error?.status,
            statusText: error?.statusText,
            code: error?.code,
            type: error?.type,
            stack: error?.stack,
            error: error,
          })
          // If request was aborted, return early (don't send error response)
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return new Response(null, { status: 499 }) // 499 = Client Closed Request
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
