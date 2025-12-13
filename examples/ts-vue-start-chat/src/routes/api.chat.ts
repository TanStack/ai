import { createFileRoute } from '@tanstack/vue-router'
import { chat, maxIterations, toStreamResponse } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'
import { anthropic } from '@tanstack/ai-anthropic'
import { gemini } from '@tanstack/ai-gemini'
import { ollama } from '@tanstack/ai-ollama'
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

        try {
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

          const selectedModel = model || defaultModel
          console.log(
            `[API Route] Using provider: ${provider}, model: ${selectedModel}`,
          )

          const stream = chat({
            adapter: adapter as any,
            model: selectedModel as any,
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

          return toStreamResponse(stream, { abortController })
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
