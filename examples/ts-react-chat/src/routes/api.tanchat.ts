import { createFileRoute } from '@tanstack/react-router'
import { ai, aiOptions, maxIterations, toStreamResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { ollamaText } from '@tanstack/ai-ollama'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import {
  addToCartToolDef,
  addToWishListToolDef,
  getGuitars,
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

        // Extract provider and conversationId from data
        const provider: Provider = data?.provider || 'openai'
        const conversationId: string | undefined = data?.conversationId

        // Pre-define adapters with model - full type inference and autocomplete!
        const adapters = {
          anthropic: () => anthropicText(data.model || 'claude-sonnet-4-5'),
          gemini: () => geminiText(data.model || 'gemini-2.0-flash'),
          ollama: () => ollamaText(data.model || 'mistral'),
          openai: () => openaiText(data.model || 'gpt-4o'),
        }

        try {
          // Get adapter with model baked in - full type safety!
          const adapter = adapters[provider]()
          console.log(
            `[API Route] Using provider: ${provider}, model: ${adapter.model}`,
          )
          const opts = aiOptions({
            adapter: openaiText("gpt-5", {
              "providerOptions": {
                "text": {}
              },

            }),
            stream: true,
            options: {

            },

          })
          const stream = ai({
            ...opts,
            tools: [
              getGuitars, // Server tool
              recommendGuitarToolDef, // No server execute - client will handle
              addToCartToolServer,
              addToWishListToolDef,
              getPersonalGuitarPreferenceToolDef,
            ],
            options: {

            },

            systemPrompts: [SYSTEM_PROMPT],
            agentLoopStrategy: maxIterations(20),
            messages,
            abortController,
            conversationId,
          })
          return toStreamResponse(stream, { abortController })
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
