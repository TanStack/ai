import {
  chat,
  chatParamsFromRequestBody,
  createChatOptions,
  maxIterations,
  mergeAgentTools,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { Tool } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { ollamaText } from '@tanstack/ai-ollama'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'

import type { RequestHandler } from './$types'
import { env } from '$env/dynamic/private'

import {
  addToCartToolDef,
  addToWishListToolDef,
  getGuitars,
  getPersonalGuitarPreferenceToolDef,
  recommendGuitarToolDef,
} from '$lib/guitar-tools'

type Provider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

// Populate process.env with the SvelteKit environment variables
// This is needed because the TanStack AI adapters read from process.env
if (env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = env.OPENAI_API_KEY
if (env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY
if (env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY

// Pre-define typed adapter configurations with full type inference
// This pattern gives you model autocomplete at definition time
const adapterConfig = {
  anthropic: () =>
    createChatOptions({
      adapter: anthropicText('claude-sonnet-4-5'),
    }),
  gemini: () =>
    createChatOptions({
      adapter: geminiText('gemini-2.0-flash'),
    }),
  ollama: () =>
    createChatOptions({
      adapter: ollamaText('mistral:7b'),
    }),
  openai: () =>
    createChatOptions({
      adapter: openaiText('gpt-4o'),
    }),
}

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

const serverToolsList = [
  getGuitars, // Server tool
  recommendGuitarToolDef, // No server execute - client will handle
  addToCartToolServer,
  addToWishListToolDef,
  getPersonalGuitarPreferenceToolDef,
]

const serverTools: Record<string, Tool> = Object.fromEntries(
  serverToolsList.map((t) => [t.name, t]),
)

export const POST: RequestHandler = async ({ request }) => {
  // Capture request signal before reading body (it may be aborted after body is consumed)
  const requestSignal = request.signal

  // If request is already aborted, return early
  if (requestSignal.aborted) {
    return new Response(null, { status: 499 }) // 499 = Client Closed Request
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

  // Extract provider from forwardedProps (sent by the client)
  const provider: Provider =
    typeof params.forwardedProps?.provider === 'string' &&
    params.forwardedProps.provider in adapterConfig
      ? (params.forwardedProps.provider as Provider)
      : 'openai'

  try {
    // Get typed adapter options using createOptions pattern
    const options = adapterConfig[provider]()

    const mergedTools = mergeAgentTools(serverTools, params.tools)

    const stream = chat({
      ...options,
      tools: Object.values(mergedTools),
      systemPrompts: [SYSTEM_PROMPT],
      agentLoopStrategy: maxIterations(20),
      messages: params.messages,
      threadId: params.threadId,
      runId: params.runId,
      abortController,
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
}
