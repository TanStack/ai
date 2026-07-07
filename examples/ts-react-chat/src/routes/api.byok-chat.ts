import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createGeminiChat } from '@tanstack/ai-gemini'
import { byokMissing, getByokKey } from '@tanstack/ai-byok/server'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { ProviderId } from '@tanstack/ai-byok/server'

/**
 * BYOK chat relay — stateless pass-through.
 *
 * The user's key is read from the per-provider request header (never the body,
 * so it never lands in persisted message history) and handed to the adapter for
 * this one call. It is never persisted or logged.
 */

// Build an adapter from a per-request key. Each provider exposes a
// `create*Chat(model, apiKey)` factory that takes an explicit key.
const adapters: Record<
  ProviderId & ('openai' | 'anthropic' | 'gemini'),
  (model: string, apiKey: string) => AnyTextAdapter
> = {
  openai: (model, apiKey) =>
    createOpenaiChat((model || 'gpt-5.2') as 'gpt-5.2', apiKey),
  anthropic: (model, apiKey) =>
    createAnthropicChat(
      (model || 'claude-sonnet-4-6') as 'claude-sonnet-4-6',
      apiKey,
    ),
  gemini: (model, apiKey) =>
    createGeminiChat(
      (model || 'gemini-3.1-pro-preview') as 'gemini-3.1-pro-preview',
      apiKey,
    ),
}

function isSupportedProvider(value: string): value is keyof typeof adapters {
  return value in adapters
}

export const Route = createFileRoute('/api/byok-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
        const model =
          typeof params.forwardedProps.model === 'string'
            ? params.forwardedProps.model
            : ''

        if (!isSupportedProvider(requestedProvider)) {
          return new Response(`Unsupported provider "${requestedProvider}"`, {
            status: 400,
          })
        }

        // Read the BYOK key from the header only. No key → typed 401 the client
        // renders as "add your <provider> key".
        const apiKey = getByokKey(request, requestedProvider)
        if (!apiKey) return byokMissing(requestedProvider)

        const stream = chat({
          adapter: adapters[requestedProvider](model, apiKey),
          messages: params.messages,
          threadId: params.threadId,
          runId: params.runId,
        })
        return toServerSentEventsResponse(stream)
      },
    },
  },
})
