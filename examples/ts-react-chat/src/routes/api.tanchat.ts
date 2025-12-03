import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toStreamResponse } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'
import { ollama } from '@tanstack/ai-ollama'
import { anthropic } from '@tanstack/ai-anthropic'
import { gemini } from '@tanstack/ai-gemini'
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

        // Extract provider and model from data
        const provider: Provider = data?.provider || 'openai'
        const model: string | undefined = data?.model

        try {
          // Select adapter based on provider
          let adapter
          let defaultModel

          switch (provider) {
            case 'anthropic':
              adapter = anthropic()
              defaultModel = 'claude-sonnet-4-5-20250929'
              break
            case 'gemini':
              adapter = gemini()
              defaultModel = 'gemini-2.0-flash-exp'
              break
            case 'ollama':
              adapter = ollama()
              defaultModel = 'mistral:7b'
              break
            case 'openai':
            default:
              adapter = openai()
              defaultModel = 'gpt-4o'
              break
          }

          // Determine model - use provided model or default based on provider
          const selectedModel = model || defaultModel

          const stream = chat({
            adapter: adapter as any,
            model: selectedModel as any,
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
