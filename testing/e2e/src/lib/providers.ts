import type { AnyTextAdapter } from '@tanstack/ai'
import { createChatOptions } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createGeminiChat } from '@tanstack/ai-gemini'
import { createOllamaChat } from '@tanstack/ai-ollama'
import { createGroqText } from '@tanstack/ai-groq'
import { createGrokText } from '@tanstack/ai-grok'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import type { Provider } from '@/lib/types'

const LLMOCK_URL = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

const defaultModels: Record<Provider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5',
  gemini: 'gemini-2.0-flash',
  ollama: 'mistral',
  groq: 'llama-3.3-70b-versatile',
  grok: 'grok-3',
  openrouter: 'openai/gpt-4o',
}

export function createTextAdapter(
  provider: Provider,
  modelOverride?: string,
): { adapter: AnyTextAdapter } {
  const model = modelOverride ?? defaultModels[provider]

  const factories: Record<Provider, () => { adapter: AnyTextAdapter }> = {
    openai: () =>
      createChatOptions({
        adapter: createOpenaiChat(model as 'gpt-4o', DUMMY_KEY, {
          baseURL: LLMOCK_URL,
        }),
      }),
    anthropic: () =>
      createChatOptions({
        adapter: createAnthropicChat(
          model as 'claude-sonnet-4-5',
          DUMMY_KEY,
          { baseURL: LLMOCK_URL },
        ),
      }),
    gemini: () =>
      createChatOptions({
        adapter: createGeminiChat(model as 'gemini-2.0-flash', DUMMY_KEY, {
          baseURL: LLMOCK_URL,
        }),
      }),
    ollama: () =>
      createChatOptions({
        adapter: createOllamaChat(model as 'mistral', LLMOCK_URL),
      }),
    groq: () =>
      createChatOptions({
        adapter: createGroqText(
          model as 'llama-3.3-70b-versatile',
          DUMMY_KEY,
          { baseURL: LLMOCK_URL },
        ),
      }),
    grok: () =>
      createChatOptions({
        adapter: createGrokText(model as 'grok-3', DUMMY_KEY, {
          baseURL: LLMOCK_URL,
        }),
      }),
    openrouter: () =>
      createChatOptions({
        adapter: createOpenRouterText(
          model as 'openai/gpt-4o',
          DUMMY_KEY,
          { baseURL: LLMOCK_URL },
        ),
      }),
  }

  return factories[provider]()
}
