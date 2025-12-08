import type { OpenRouterBaseOptions } from './text/text-provider-options'

export const OPENROUTER_CHAT_MODELS: ReadonlyArray<string> = [] as const

export type OpenRouterChatModelProviderOptionsByName = {
  [key: string]: OpenRouterBaseOptions
}

export type OpenRouterModelInputModalitiesByName = {
  [key: string]: ReadonlyArray<'text' | 'image' | 'audio' | 'video'>
}
