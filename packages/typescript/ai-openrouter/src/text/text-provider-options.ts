import type { ChatGenerationParams } from '@openrouter/sdk/models'
import type { OPENROUTER_CHAT_MODELS } from '../model-meta'

type OpenRouterChatModel = (typeof OPENROUTER_CHAT_MODELS)[number]

// ---------------------------------------------------------------------------
// Type aliases derived from the SDK's ChatGenerationParams
// ---------------------------------------------------------------------------

export type ProviderPreferences = NonNullable<ChatGenerationParams['provider']>

export type Plugin = NonNullable<ChatGenerationParams['plugins']>[number]

export type WebPlugin = Extract<Plugin, { id: 'web' }>

export type PluginFileParser = Extract<Plugin, { id: 'file-parser' }>

export type PluginResponseHealing = Extract<Plugin, { id: 'response-healing' }>

export type PluginModeration = Extract<Plugin, { id: 'moderation' }>

export type PluginAutoRouter = Extract<Plugin, { id: 'auto-router' }>

export type PdfParserOptions = NonNullable<PluginFileParser['pdf']>

export type ReasoningOptions = NonNullable<ChatGenerationParams['reasoning']>

export type StreamOptions = NonNullable<ChatGenerationParams['streamOptions']>

// ---------------------------------------------------------------------------
// ImageConfig – no SDK equivalent
// ---------------------------------------------------------------------------

export type ImageConfig = {
  /**
   * The aspect ratio for generated images.
   */
  aspect_ratio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | string

  image_size?: '1k' | '2k' | '4k'
}

// ---------------------------------------------------------------------------
// Composite option types used by model-meta and the text adapter
// ---------------------------------------------------------------------------

export type OpenRouterCommonOptions = Pick<
  ChatGenerationParams,
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
  ChatGenerationParams,
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
  | 'reasoning'
  | 'toolChoice'
>

export type ExternalTextProviderOptions = OpenRouterCommonOptions &
  OpenRouterBaseOptions
