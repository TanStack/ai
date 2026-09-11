import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  createChatOptions,
  maxIterations,
  mergeAgentTools,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { OPENAI_CHAT_MODELS, createOpenaiChat } from '@tanstack/ai-openai'
import { openaiByok } from '@tanstack/ai-openai/byok'
import { OllamaTextModels, ollamaText } from '@tanstack/ai-ollama'
import { ANTHROPIC_MODELS, createAnthropicChat } from '@tanstack/ai-anthropic'
import { anthropicByok } from '@tanstack/ai-anthropic/byok'
import { GEMINI_MODELS, createGeminiChat } from '@tanstack/ai-gemini'
import { geminiByok } from '@tanstack/ai-gemini/byok'
import { createGeminiTextInteractions } from '@tanstack/ai-gemini/experimental'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { OPENROUTER_CHAT_MODELS } from '@tanstack/ai-openrouter/model-meta'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { GROK_CHAT_MODELS, createGrokText } from '@tanstack/ai-grok'
import { grokByok } from '@tanstack/ai-grok/byok'
import { GROQ_CHAT_MODELS, createGroqText } from '@tanstack/ai-groq'
import { groqByok } from '@tanstack/ai-groq/byok'
import { createCloudflareText } from '@tanstack/ai-cloudflare'
import {
  cloudflareAccountByok,
  cloudflareByok,
} from '@tanstack/ai-cloudflare/byok'
import { BEDROCK_CONVERSE_MODELS, bedrockText } from '@tanstack/ai-bedrock'
import { BYTEPLUS_CHAT_MODELS, createBytePlusText } from '@tanstack/ai-byteplus'
import { byteplusByok } from '@tanstack/ai-byteplus/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { z } from 'zod'
import type { AnyTextAdapter, ChatMiddleware } from '@tanstack/ai'
import type { ByokProvider } from '@tanstack/ai/byok'
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
import { viaCloudflareGateway } from '@/lib/cloudflare-gateway'

/**
 * Client-supplied provider + model, validated once per request. An unknown
 * provider falls back to OpenAI and an unknown model falls back to that
 * provider's default, so arbitrary client strings never reach an adapter.
 * The parsed `model` is narrowed to each adapter's literal model union.
 */
const modelSelectionSchema = z
  .discriminatedUnion('provider', [
    z.object({
      provider: z.literal('openai'),
      model: z.enum(OPENAI_CHAT_MODELS).catch('gpt-5.2'),
    }),
    z.object({
      provider: z.literal('anthropic'),
      model: z.enum(ANTHROPIC_MODELS).catch('claude-sonnet-4-6'),
    }),
    z.object({
      provider: z.literal('gemini'),
      model: z.enum(GEMINI_MODELS).catch('gemini-3.1-pro-preview'),
    }),
    z.object({
      provider: z.literal('gemini-interactions'),
      model: z.enum(GEMINI_MODELS).catch('gemini-3.1-pro-preview'),
    }),
    z.object({
      provider: z.literal('ollama'),
      model: z.enum(OllamaTextModels).catch('gpt-oss:20b'),
    }),
    z.object({
      provider: z.literal('grok'),
      model: z.enum(GROK_CHAT_MODELS).catch('grok-build-0.1'),
    }),
    z.object({
      provider: z.literal('groq'),
      model: z.enum(GROQ_CHAT_MODELS).catch('openai/gpt-oss-120b'),
    }),
    z.object({
      provider: z.literal('openrouter'),
      model: z.enum(OPENROUTER_CHAT_MODELS).catch('openai/gpt-5.1'),
    }),
    z.object({
      provider: z.literal('bedrock'),
      model: z
        .enum(BEDROCK_CONVERSE_MODELS)
        .catch('us.anthropic.claude-haiku-4-5-20251001-v1:0'),
    }),
    z.object({
      provider: z.literal('byteplus'),
      model: z.enum(BYTEPLUS_CHAT_MODELS).catch('seed-2-0-lite-260428'),
    }),
    z.object({
      provider: z.literal('cloudflare'),
      model: z.string().catch('@cf/zai-org/glm-5.3-flash'),
    }),
  ])
  .catch({ provider: 'openai', model: 'gpt-5.2' })

type ModelSelection = z.infer<typeof modelSelectionSchema>
type Provider = ModelSelection['provider']

const BYOK_PROVIDERS: Partial<Record<Provider, ByokProvider>> = {
  openai: openaiByok,
  anthropic: anthropicByok,
  gemini: geminiByok,
  openrouter: openrouterByok,
  groq: groqByok,
  grok: grokByok,
  byteplus: byteplusByok,
  cloudflare: cloudflareByok,
}

function chatByokProvider(provider: Provider): ByokProvider | undefined {
  if (provider === 'gemini-interactions') return geminiByok
  return BYOK_PROVIDERS[provider]
}

function resolveByokApiKey(
  request: Request,
  provider: Provider,
):
  | { missing: false; apiKey: string | null }
  | { missing: true; provider: ByokProvider } {
  const byokProvider = chatByokProvider(provider)
  if (!byokProvider) return { missing: false, apiKey: null }
  const apiKey = getByokKey(request, byokProvider)
  if (!apiKey) return { missing: true, provider: byokProvider }
  return { missing: false, apiKey }
}

function requireApiKey(apiKey: string | null): string {
  if (!apiKey) {
    throw new Error('API key is required')
  }
  return apiKey
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

        // Validate the client-supplied provider + model (see the schema).
        const selection = modelSelectionSchema.parse({
          provider: params.forwardedProps.provider,
          model: params.forwardedProps.model,
        })
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

        // Build typed adapter options from the validated selection. Each case
        // sees `model` narrowed to that adapter's model union.
        const buildChatOptions = (
          { provider, model }: ModelSelection,
          apiKey: string | null,
          cloudflareAccountId: string | null,
        ): { adapter: AnyTextAdapter } => {
          switch (provider) {
            case 'anthropic':
              return createChatOptions({
                adapter: createAnthropicChat(
                  model,
                  requireApiKey(apiKey),
                  viaCloudflareGateway('anthropic'),
                ),
              })
            case 'openrouter':
              return createChatOptions({
                adapter: createOpenRouterText(model, requireApiKey(apiKey)),
                modelOptions: {
                  reasoning: {
                    effort: 'medium',
                  },
                },
              })
            case 'gemini':
              return createChatOptions({
                adapter: createGeminiChat(model, requireApiKey(apiKey)),
                modelOptions: {
                  thinkingConfig: {
                    includeThoughts: true,
                    thinkingBudget: 100,
                  },
                },
              })
            case 'gemini-interactions':
              return createChatOptions({
                adapter: createGeminiTextInteractions(
                  model,
                  requireApiKey(apiKey),
                ),
                modelOptions: {
                  previous_interaction_id: previousInteractionId,
                  store: true,
                },
              })
            case 'grok':
              return createChatOptions({
                adapter: createGrokText(model, requireApiKey(apiKey)),
                modelOptions: {},
              })
            case 'groq':
              return createChatOptions({
                adapter: createGroqText(
                  model,
                  requireApiKey(apiKey),
                  viaCloudflareGateway('groq'),
                ),
              })
            case 'bedrock':
              return createChatOptions({
                // Default Converse API. Auth is 'auto' (BEDROCK_API_KEY /
                // AWS_BEARER_TOKEN_BEDROCK, then the SigV4 credential chain) unless
                // BEDROCK_AUTH=sigv4 forces SigV4 via the AWS credential chain
                // (env vars or `aws configure` profile). Region defaults to us-east-1.
                adapter: bedrockText(model, {
                  region: process.env.AWS_REGION || 'us-east-1',
                  ...(process.env.BEDROCK_AUTH === 'sigv4' && {
                    auth: 'sigv4' as const,
                  }),
                }),
              })
            case 'byteplus':
              return createChatOptions({
                // BytePlus ModelArk. Keys are region-isolated — an EU key will
                // not work against the Asia-Pacific host.
                adapter: createBytePlusText(model, requireApiKey(apiKey)),
              })
            case 'cloudflare':
              return createChatOptions({
                // Workers AI over REST. Account id and token both come from
                // BYOK, with CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN as
                // the env fallback. With CLOUDFLARE_AI_GATEWAY_ID set,
                // requests (including `provider/model` ids such as
                // openai/gpt-5.5) go through that AI Gateway.
                adapter: createCloudflareText(model, {
                  accountId: requireApiKey(cloudflareAccountId),
                  apiKey: requireApiKey(apiKey),
                  ...(process.env.CLOUDFLARE_AI_GATEWAY_ID && {
                    gateway: { id: process.env.CLOUDFLARE_AI_GATEWAY_ID },
                  }),
                }),
              })
            case 'ollama':
              return createChatOptions({
                adapter: ollamaText(model),
                modelOptions: { think: 'low', options: { top_k: 1 } },
              })
            case 'openai':
              return createChatOptions({
                adapter: createOpenaiChat(
                  model,
                  requireApiKey(apiKey),
                  viaCloudflareGateway('openai'),
                ),
                modelOptions: {
                  prompt_cache_key: 'user-session-12345',
                  prompt_cache_retention: '24h',
                },
              })
          }
        }

        try {
          const provider: Provider = selection.provider
          const resolvedKey = resolveByokApiKey(request, provider)
          if (resolvedKey.missing) {
            return byokMissing(resolvedKey.provider)
          }
          // Get typed adapter options using createChatOptions pattern
          // Cloudflare needs a second BYOK value: the account the token belongs to.
          const cloudflareAccountId =
            provider === 'cloudflare'
              ? getByokKey(request, cloudflareAccountByok)
              : null
          if (provider === 'cloudflare' && !cloudflareAccountId) {
            return byokMissing(cloudflareAccountByok)
          }
          const options = buildChatOptions(
            selection,
            resolvedKey.apiKey,
            cloudflareAccountId,
          )

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
            tools: mergedTools,
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
