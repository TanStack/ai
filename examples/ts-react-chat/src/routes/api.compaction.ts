import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  createChatOptions,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import {
  evictOldest,
  summarizeOldest,
  withCompaction,
} from '@tanstack/ai-compaction'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { anthropicByok } from '@tanstack/ai-anthropic/byok'
import { createGeminiChat } from '@tanstack/ai-gemini'
import { geminiByok } from '@tanstack/ai-gemini/byok'
import { createGrokText } from '@tanstack/ai-grok'
import { grokByok } from '@tanstack/ai-grok/byok'
import { createGroqText } from '@tanstack/ai-groq'
import { groqByok } from '@tanstack/ai-groq/byok'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { openaiByok } from '@tanstack/ai-openai/byok'
import { ollamaText } from '@tanstack/ai-ollama'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import type { AnyTextAdapter, ModelMessage } from '@tanstack/ai'
import type { ByokProvider } from '@tanstack/ai/byok'
import type { Provider } from '@/lib/model-selection'

const BYOK_PROVIDERS: Partial<Record<Provider, ByokProvider>> = {
  openai: openaiByok,
  anthropic: anthropicByok,
  gemini: geminiByok,
  openrouter: openrouterByok,
  groq: groqByok,
  grok: grokByok,
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

async function summarizeWith(
  adapter: AnyTextAdapter,
  messages: Array<ModelMessage>,
): Promise<string> {
  let text = ''
  for await (const chunk of chat({
    adapter,
    messages: [
      ...messages,
      {
        role: 'user',
        content: 'Summarize the conversation above in 3-4 sentences.',
      },
    ],
    agentLoopStrategy: maxIterations(1),
  })) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT') text += chunk.delta
  }
  return text
}

const SYSTEM_PROMPT = `You are a helpful assistant. Keep answers reasonably long
(a paragraph or two) so this demo's context fills up quickly.`

/**
 * Chat endpoint for `/compaction`. Uses a small `maxTokens` so compaction
 * fires after a few turns. Keys come from BYOK headers, same as `/api/tanchat`.
 */
export const Route = createFileRoute('/api/compaction')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestSignal = request.signal
        if (requestSignal.aborted) {
          return new Response(null, { status: 499 })
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

        const requestedProvider =
          typeof params.forwardedProps.provider === 'string'
            ? params.forwardedProps.provider
            : 'openai'
        const model: string =
          typeof params.forwardedProps.model === 'string'
            ? params.forwardedProps.model
            : 'gpt-5.5'
        const maxTokens: number =
          typeof params.forwardedProps.maxTokens === 'number' &&
          params.forwardedProps.maxTokens > 0
            ? params.forwardedProps.maxTokens
            : 400
        const strategyName: 'evict' | 'summarize' =
          params.forwardedProps.strategy === 'summarize' ? 'summarize' : 'evict'

        const adapterConfig: Partial<
          Record<
            Provider,
            (apiKey: string | null) => { adapter: AnyTextAdapter }
          >
        > = {
          anthropic: (apiKey) =>
            createChatOptions({
              adapter: createAnthropicChat(
                (model || 'claude-sonnet-4-6') as 'claude-sonnet-4-6',
                requireApiKey(apiKey),
              ),
            }),
          gemini: (apiKey) =>
            createChatOptions({
              adapter: createGeminiChat(
                (model || 'gemini-3.1-pro-preview') as 'gemini-3.1-pro-preview',
                requireApiKey(apiKey),
              ),
            }),
          grok: (apiKey) =>
            createChatOptions({
              adapter: createGrokText(
                (model || 'grok-build-0.1') as 'grok-build-0.1',
                requireApiKey(apiKey),
              ),
            }),
          groq: (apiKey) =>
            createChatOptions({
              adapter: createGroqText(
                (model || 'openai/gpt-oss-120b') as 'openai/gpt-oss-120b',
                requireApiKey(apiKey),
              ),
            }),
          ollama: () =>
            createChatOptions({
              adapter: ollamaText((model || 'mistral:7b') as 'mistral:7b'),
            }),
          openai: (apiKey) =>
            createChatOptions({
              adapter: createOpenaiChat(
                (model || 'gpt-5.5') as 'gpt-5.5',
                requireApiKey(apiKey),
              ),
            }),
          openrouter: (apiKey) =>
            createChatOptions({
              adapter: createOpenRouterText(
                (model || 'openai/gpt-5.1') as 'openai/gpt-5.1',
                requireApiKey(apiKey),
              ),
            }),
        }

        try {
          const provider: Provider =
            requestedProvider in adapterConfig
              ? (requestedProvider as Provider)
              : 'openai'
          const resolvedKey = resolveByokApiKey(request, provider)
          if (resolvedKey.missing) {
            return byokMissing(resolvedKey.provider)
          }

          const makeOptions = adapterConfig[provider]
          if (!makeOptions) {
            return new Response(JSON.stringify({ error: 'Unknown provider' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            })
          }
          const options = makeOptions(resolvedKey.apiKey)
          const { adapter } = options

          const strategy =
            strategyName === 'summarize'
              ? summarizeOldest({
                  summarize: (msgs) => summarizeWith(adapter, msgs),
                })
              : evictOldest()

          const stream = chat({
            ...options,
            adapter,
            tools: [],
            systemPrompts: [SYSTEM_PROMPT],
            middleware: [withCompaction({ maxTokens, strategy })],
            agentLoopStrategy: maxIterations(5),
            messages: params.messages,
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'An error occurred'
          console.error('[api.compaction] Error:', message)
          if (
            (error instanceof Error && error.name === 'AbortError') ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
