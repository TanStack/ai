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
import { geminiTextInteractions } from '@tanstack/ai-gemini/experimental'
import { openRouterText } from '@tanstack/ai-openrouter'
import { grokText } from '@tanstack/ai-grok'
import { groqText } from '@tanstack/ai-groq'
import type { AnyTextAdapter, ChatMiddleware } from '@tanstack/ai'
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

type Provider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'gemini-interactions'
  | 'ollama'
  | 'grok'
  | 'groq'
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
const addToCartToolServer = addToCartToolDef.server((args, context) => {
  context?.emitCustomEvent('tool:progress', {
    tool: 'addToCart',
    message: `Adding ${args.quantity}x guitar ${args.guitarId} to cart`,
  })
  const cartId = 'CART_' + Date.now()
  context?.emitCustomEvent('tool:progress', {
    tool: 'addToCart',
    message: `Cart ${cartId} created successfully`,
  })
  return {
    success: true,
    cartId,
    guitarId: args.guitarId,
    quantity: args.quantity,
    totalItems: args.quantity,
  }
})

const loggingMiddleware: ChatMiddleware = {
  name: 'logging',
  onConfig(ctx, config) {
    console.log(
      `[logging] onConfig iteration=${ctx.iteration} model=${ctx.model} tools=${config.tools.length}`,
    )
  },
  onStart(ctx) {
    console.log(`[logging] onStart requestId=${ctx.requestId}`)
  },
  onIteration(ctx, info) {
    console.log(`[logging] onIteration iteration=${info.iteration}`)
  },
  onBeforeToolCall(ctx, toolCtx) {
    console.log(`[logging] onBeforeToolCall tool=${toolCtx.toolName}`)
  },
  onAfterToolCall(ctx, info) {
    console.log(
      `[logging] onAfterToolCall tool=${info.toolName} result=${JSON.stringify(info.result).slice(0, 100)}`,
    )
  },
  onFinish(ctx, info) {
    console.log(
      `[logging] onFinish reason=${info.finishReason} iterations=${ctx.iteration}`,
    )
  },
  onUsage(ctx, usage) {
    console.log(
      `[logging] onUsage tokens=${usage.totalTokens} input=${usage.promptTokens} output=${usage.completionTokens}, total: ${usage.totalTokens}`,
    )
  },
}

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
        const model: string = data?.model || 'gpt-5.2'
        const conversationId: string | undefined = data?.conversationId
        const previousInteractionId: string | undefined =
          data?.previousInteractionId

        // Pre-define typed adapter configurations with full type inference
        // Model is passed to the adapter factory function for type-safe autocomplete
        const adapterConfig: Record<
          Provider,
          () => { adapter: AnyTextAdapter }
        > = {
          anthropic: () =>
            createChatOptions({
              adapter: anthropicText(
                (model || 'claude-sonnet-4-6') as 'claude-sonnet-4-6',
              ),
            }),
          openrouter: () =>
            createChatOptions({
              adapter: openRouterText(
                (model || 'openai/gpt-5.2') as 'openai/gpt-5.2',
              ),
              modelOptions: {
                reasoning: {
                  effort: 'medium',
                },
              },
            }),
          gemini: () =>
            createChatOptions({
              adapter: geminiText(
                (model || 'gemini-3.1-pro-preview') as 'gemini-3.1-pro-preview',
              ),
              modelOptions: {
                thinkingConfig: {
                  includeThoughts: true,
                  thinkingBudget: 100,
                },
              },
            }),
          'gemini-interactions': () =>
            createChatOptions({
              adapter: geminiTextInteractions(
                (model || 'gemini-3.1-pro-preview') as 'gemini-3.1-pro-preview',
              ),
              modelOptions: {
                previous_interaction_id: previousInteractionId,
                store: true,
              },
            }),
          grok: () =>
            createChatOptions({
              adapter: grokText((model || 'grok-4.20') as 'grok-4.20'),
              modelOptions: {},
            }),
          groq: () =>
            createChatOptions({
              adapter: groqText(
                (model || 'openai/gpt-oss-120b') as 'openai/gpt-oss-120b',
              ),
            }),
          ollama: () =>
            createChatOptions({
              adapter: ollamaText((model || 'gpt-oss:20b') as 'gpt-oss:20b'),
              modelOptions: { think: 'low', options: { top_k: 1 } },
            }),
          openai: () =>
            createChatOptions({
              adapter: openaiText((model || 'gpt-5.2') as 'gpt-5.2'),
              modelOptions: {},
            }),
        }

        try {
          // Get typed adapter options using createChatOptions pattern
          const options = adapterConfig[provider]()

          // Note: We cast to AsyncIterable<StreamChunk> because all chat adapters
          // return streams, but TypeScript sees a union of all possible return types
          // Gemini's Interactions API rejects tool parameter schemas that
          // include `anyOf` (e.g. Zod unions), so the guitar tool suite
          // isn't wired for that provider. Other providers get the full set.
          const tools =
            provider === 'gemini-interactions'
              ? []
              : [
                  getGuitars, // Server tool
                  recommendGuitarToolDef, // No server execute - client will handle
                  addToCartToolServer,
                  addToWishListToolDef,
                  getPersonalGuitarPreferenceToolDef,
                  // Lazy tools - discovered on demand
                  compareGuitars,
                  calculateFinancing,
                  searchGuitars,
                ]

          const stream = chat({
            ...options,
            tools,
            middleware: [loggingMiddleware],
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
