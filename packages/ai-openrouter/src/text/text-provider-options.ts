import type {
  ChatContentCacheControl,
  ChatRequest,
} from '@openrouter/sdk/models'
import type { OPENROUTER_CHAT_MODELS } from '../model-meta'

type OpenRouterChatModel = (typeof OPENROUTER_CHAT_MODELS)[number]

export type ProviderPreferences = NonNullable<ChatRequest['provider']>

export type Plugin = NonNullable<ChatRequest['plugins']>[number]

export type WebPlugin = Extract<Plugin, { id: 'web' }>

export type PluginFileParser = Extract<Plugin, { id: 'file-parser' }>

export type PluginResponseHealing = Extract<Plugin, { id: 'response-healing' }>

export type PluginModeration = Extract<Plugin, { id: 'moderation' }>

export type PluginAutoRouter = Extract<Plugin, { id: 'auto-router' }>

export type PdfParserOptions = NonNullable<PluginFileParser['pdf']>

export type ReasoningOptions = NonNullable<ChatRequest['reasoning']> & {
  enabled?: false
}

export type StreamOptions = NonNullable<ChatRequest['streamOptions']>

export type ImageConfig = {
  aspect_ratio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | string

  image_size?: '1k' | '2k' | '4k'
}

export type OpenRouterCommonOptions = Pick<
  ChatRequest,
  | 'provider'
  | 'plugins'
  | 'user'
  | 'sessionId'
  | 'metadata'
  | 'debug'
  | 'trace'
  | 'streamOptions'
  | 'parallelToolCalls'
  | 'modalities'
> & {
  models?: Array<OpenRouterChatModel>
  variant?: 'free' | 'nitro' | 'online' | 'exacto' | 'extended' | 'thinking'
}

export type OpenRouterBaseOptions = Pick<
  ChatRequest,
  | 'stop'
  | 'maxCompletionTokens'
  | 'temperature'
  | 'topP'
  | 'frequencyPenalty'
  | 'presencePenalty'
  | 'logitBias'
  | 'logprobs'
  | 'topLogprobs'
  | 'seed'
  | 'responseFormat'
  | 'toolChoice'
  | 'parallelToolCalls'
> & {
  reasoning?: ReasoningOptions
}

export type ExternalTextProviderOptions = OpenRouterCommonOptions &
  OpenRouterBaseOptions

export type OpenRouterSystemPromptMetadata = {
  cache_control?: ChatContentCacheControl
}
