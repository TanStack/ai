import type { AnyTextAdapter } from '@tanstack/ai'
import { createChatOptions } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createGeminiChat } from '@tanstack/ai-gemini'
import { createGeminiTextInteractions } from '@tanstack/ai-gemini/experimental'
import { createOllamaChat } from '@tanstack/ai-ollama'
import { createGroqText } from '@tanstack/ai-groq'
import { createGrokText } from '@tanstack/ai-grok'
import {
  createOpenRouterResponsesText,
  createOpenRouterText,
} from '@tanstack/ai-openrouter'
import { HTTPClient } from '@openrouter/sdk'
import type { Feature, Provider } from '@/lib/types'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

const defaultModels: Record<Provider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5',
  gemini: 'gemini-2.0-flash',
  ollama: 'mistral',
  groq: 'llama-3.3-70b-versatile',
  grok: 'grok-3',
  openrouter: 'openai/gpt-4o',
  'openrouter-responses': 'openai/gpt-4o',
  // ElevenLabs has no chat/text model — the support matrix already filters
  // it out of text features, but we still need an entry to satisfy the
  // Record<Provider, …> constraint.
  elevenlabs: '',
}

export function createTextAdapter(
  provider: Provider,
  modelOverride?: string,
  aimockPort?: number,
  testId?: string,
  feature?: Feature,
): { adapter: AnyTextAdapter } {
  const model = modelOverride ?? defaultModels[provider]

  // OpenAI, Grok SDKs need /v1 in baseURL. Groq SDK appends /openai/v1/ internally.
  // Anthropic, Gemini, Ollama SDKs include their path prefixes internally
  const base = LLMOCK_DEFAULT_BASE
  const openaiUrl = `${base}/v1`

  // X-Test-Id header for per-test sequenceIndex isolation in aimock
  const testHeaders = testId ? { 'X-Test-Id': testId } : undefined

  // The Gemini Interactions API lives at a different endpoint
  // (POST /v1beta/interactions) and uses a different adapter than the
  // standard Gemini chat path.
  if (provider === 'gemini' && feature === 'stateful-interactions') {
    return createChatOptions({
      adapter: createGeminiTextInteractions(
        model as 'gemini-2.0-flash',
        DUMMY_KEY,
        {
          httpOptions: {
            baseUrl: base,
            headers: testHeaders,
          },
        },
      ),
    })
  }

  const factories: Record<Provider, () => { adapter: AnyTextAdapter }> = {
    openai: () =>
      createChatOptions({
        adapter: createOpenaiChat(model as 'gpt-4o', DUMMY_KEY, {
          baseURL: openaiUrl,
          defaultHeaders: testHeaders,
        }),
      }),
    anthropic: () =>
      createChatOptions({
        adapter: createAnthropicChat(model as 'claude-sonnet-4-5', DUMMY_KEY, {
          baseURL: base,
          defaultHeaders: testHeaders,
        }),
      }),
    gemini: () =>
      createChatOptions({
        adapter: createGeminiChat(model as 'gemini-2.0-flash', DUMMY_KEY, {
          httpOptions: {
            baseUrl: base,
            headers: testHeaders,
          },
        }),
      }),
    ollama: () =>
      createChatOptions({
        adapter: createOllamaChat(
          model as 'mistral',
          testHeaders ? { host: base, headers: testHeaders } : base,
        ),
      }),
    groq: () =>
      createChatOptions({
        adapter: createGroqText(model as 'llama-3.3-70b-versatile', DUMMY_KEY, {
          baseURL: base,
          defaultHeaders: testHeaders,
        }),
      }),
    grok: () =>
      createChatOptions({
        adapter: createGrokText(model as 'grok-3', DUMMY_KEY, {
          baseURL: openaiUrl,
          defaultHeaders: testHeaders,
        }),
      }),
    openrouter: () => {
      // OpenRouter SDK exposes an HTTPClient with beforeRequest hooks. Use
      // that to inject X-Test-Id, since `defaultHeaders` isn't supported and
      // the SDK strips query params off `serverURL` when building per-request
      // URLs (it does `new URL(path, baseURL)` which drops the search), so
      // the previous `?testId=...` trick never actually reached aimock and
      // multiple openrouter tests collided on the `__default__` test bucket.
      const httpClient = new HTTPClient()
      if (testId) {
        httpClient.addHook('beforeRequest', (req) => {
          const next = new Request(req)
          next.headers.set('X-Test-Id', testId)
          return next
        })
      }
      return createChatOptions({
        adapter: createOpenRouterText(model as 'openai/gpt-4o', DUMMY_KEY, {
          serverURL: openaiUrl,
          httpClient,
        }),
      })
    },
    'openrouter-responses': () => {
      // Same X-Test-Id injection rationale as the chat-completions factory
      // above. The beta Responses endpoint uses the same SDK base URL +
      // HTTPClient surface.
      const httpClient = new HTTPClient()
      if (testId) {
        httpClient.addHook('beforeRequest', (req) => {
          const next = new Request(req)
          next.headers.set('X-Test-Id', testId)
          return next
        })
      }
      return createChatOptions({
        adapter: createOpenRouterResponsesText(
          model as 'openai/gpt-4o',
          DUMMY_KEY,
          { serverURL: openaiUrl, httpClient },
        ),
      })
    },
    elevenlabs: () => {
      throw new Error(
        'ElevenLabs has no text/chat adapter — use createTTSAdapter or createTranscriptionAdapter.',
      )
    },
  }

  return factories[provider]()
}
