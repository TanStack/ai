import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  createChatOptions,
  maxIterations,
  mergeAgentTools,
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
  inspectServerRuntimeContextToolDef,
  recommendGuitarToolDef,
  runtimeLoyaltyTiers,
  runtimePreferredStyles,
  searchGuitars,
  type ServerRuntimeContext,
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
- When the user asks about runtime context, call the inspectClientRuntimeContext
  and/or inspectServerRuntimeContext tool named in the request.

Example workflow:
User: "I want an acoustic guitar"
Step 1: Call getGuitars()
Step 2: Call recommendGuitar(id: "6")
Step 3: Done - do NOT add any text after calling recommendGuitar

`
function isAllowedValue<T extends string>(
  value: unknown,
  allowedValues: ReadonlyArray<T>,
): value is T {
  return (
    typeof value === 'string' &&
    allowedValues.some((allowedValue) => allowedValue === value)
  )
}

function readForwardedString(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback
}

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

const inspectServerRuntimeContextToolServer =
  inspectServerRuntimeContextToolDef.server<ServerRuntimeContext>(
    (_, executionContext) => {
      executionContext.emitCustomEvent('runtime-context:server', {
        userId: executionContext.context.userId,
        tenantId: executionContext.context.tenantId,
      })

      return {
        ...executionContext.context,
        source: 'server' as const,
      }
    },
  )

const serverTools = [
  getGuitars, // Server tool
  recommendGuitarToolDef, // No server execute - client will handle
  addToCartToolServer,
  addToWishListToolDef,
  getPersonalGuitarPreferenceToolDef,
  inspectServerRuntimeContextToolServer,
  // Lazy tools - discovered on demand
  compareGuitars,
  calculateFinancing,
  searchGuitars,
]

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
  onIteration(_ctx, info) {
    console.log(`[logging] onIteration iteration=${info.iteration}`)
  },
  onBeforeToolCall(_ctx, toolCtx) {
    console.log(`[logging] onBeforeToolCall tool=${toolCtx.toolName}`)
  },
  onAfterToolCall(_ctx, info) {
    console.log(
      `[logging] onAfterToolCall tool=${info.toolName} result=${JSON.stringify(info.result).slice(0, 100)}`,
    )
  },
  onFinish(ctx, info) {
    console.log(
      `[logging] onFinish reason=${info.finishReason} iterations=${ctx.iteration}`,
    )
  },
  onUsage(_ctx, usage) {
    console.log(
      `[logging] onUsage tokens=${usage.totalTokens} input=${usage.promptTokens} output=${usage.completionTokens}, total: ${usage.totalTokens}`,
    )
  },
}

function maskIdentifier(value: string): string {
  if (!value) return '<empty>'
  if (value.length <= 4) return '***'
  return `${value.slice(0, 2)}***${value.slice(-2)}`
}

const runtimeContextMiddleware: ChatMiddleware<ServerRuntimeContext> = {
  name: 'runtime-context',
  onStart(ctx) {
    console.log(
      `[runtime-context] onStart user=${maskIdentifier(ctx.context.userId)} tenant=${maskIdentifier(ctx.context.tenantId)} tier=${ctx.context.loyaltyTier}`,
    )
  },
  onBeforeToolCall(ctx, toolCtx) {
    if (toolCtx.toolName.includes('RuntimeContext')) {
      console.log(
        `[runtime-context] onBeforeToolCall tool=${toolCtx.toolName} source=${ctx.context.requestSource}`,
      )
    }
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

        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        // Extract provider and model from forwardedProps (sent by the client).
        // Provider must be allowlisted against adapterConfig (validated below)
        // to avoid SSRF/runtime crashes from arbitrary client-supplied strings.
        const requestedProvider =
          typeof params.forwardedProps.provider === 'string'
            ? params.forwardedProps.provider
            : 'openai'
        const model: string =
          typeof params.forwardedProps.model === 'string'
            ? params.forwardedProps.model
            : 'gpt-4o'
        const runtimeContext: ServerRuntimeContext = {
          userId: readForwardedString(
            params.forwardedProps.runtimeUserId,
            'user_guest',
          ),
          tenantId: readForwardedString(
            params.forwardedProps.runtimeTenantId,
            'public-store',
          ),
          loyaltyTier: isAllowedValue(
            params.forwardedProps.runtimeLoyaltyTier,
            runtimeLoyaltyTiers,
          )
            ? params.forwardedProps.runtimeLoyaltyTier
            : 'standard',
          preferredStyle: isAllowedValue(
            params.forwardedProps.runtimePreferredStyle,
            runtimePreferredStyles,
          )
            ? params.forwardedProps.runtimePreferredStyle
            : 'acoustic',
          requestSource: 'react-chat',
          serverRegion: 'local-dev',
        }
        const previousInteractionId: string | undefined =
          typeof params.forwardedProps.previousInteractionId === 'string'
            ? params.forwardedProps.previousInteractionId
            : undefined

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
                (model || 'openai/gpt-5.1') as 'openai/gpt-5.1',
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
              adapter: grokText(
                (model || 'grok-build-0.1') as 'grok-build-0.1',
              ),
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
              modelOptions: {
                prompt_cache_key: 'user-session-12345',
                prompt_cache_retention: '24h',
              },
            }),
        }

        try {
          // Allowlist provider against adapterConfig keys; fall back to openai.
          const provider: Provider =
            requestedProvider in adapterConfig
              ? (requestedProvider as Provider)
              : 'openai'
          // Get typed adapter options using createChatOptions pattern
          const options = adapterConfig[provider]()

          // All providers (including gemini-interactions) get the full
          // server-tool set merged with whatever client-side tools the
          // request brought. Historical note: gemini-interactions used
          // to be excluded because of an assumed `anyOf` incompatibility
          // and an empty-`required: []` rejection. The first turned out
          // to be a non-issue against the live API and the second is now
          // sanitized inside `@tanstack/ai-gemini/experimental`.
          const mergedTools = mergeAgentTools(serverTools, params.tools)

          const stream = chat({
            ...options,
            tools: Object.values(mergedTools),
            middleware: [loggingMiddleware, runtimeContextMiddleware],
            context: runtimeContext,
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
      },
    },
  },
})
