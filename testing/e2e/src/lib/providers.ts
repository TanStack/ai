import type { AnyTextAdapter } from '@tanstack/ai'
import { createChatOptions } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { ollamaText } from '@tanstack/ai-ollama'
import { groqText } from '@tanstack/ai-groq'
import { grokText } from '@tanstack/ai-grok'
import { openRouterText } from '@tanstack/ai-openrouter'
import type { Provider } from '@/lib/types'

const LLMOCK_URL = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

const defaultModels: Record<Provider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5',
  gemini: 'gemini-2.0-flash',
  ollama: 'mistral',
  groq: 'llama-3.3-70b-versatile',
  grok: 'grok-3',
  openrouter: 'openai/gpt-4o',
}

export function createTextAdapter(provider: Provider, modelOverride?: string): { adapter: AnyTextAdapter } {
  const model = modelOverride ?? defaultModels[provider]

  const factories: Record<Provider, () => { adapter: AnyTextAdapter }> = {
    openai: () => createChatOptions({ adapter: openaiText({ baseURL: LLMOCK_URL }, model as 'gpt-4o') }),
    anthropic: () => createChatOptions({ adapter: anthropicText({ baseURL: LLMOCK_URL }, model as 'claude-sonnet-4-5') }),
    gemini: () => createChatOptions({ adapter: geminiText({ baseURL: LLMOCK_URL }, model as 'gemini-2.0-flash') }),
    ollama: () => createChatOptions({ adapter: ollamaText({ host: LLMOCK_URL }, model as 'mistral') }),
    groq: () => createChatOptions({ adapter: groqText({ baseURL: LLMOCK_URL }, model as 'llama-3.3-70b-versatile') }),
    grok: () => createChatOptions({ adapter: grokText({ baseURL: LLMOCK_URL }, model as 'grok-3') }),
    openrouter: () => createChatOptions({ adapter: openRouterText({ baseURL: LLMOCK_URL }, model as 'openai/gpt-4o') }),
  }

  return factories[provider]()
}
