import type {
  ChatContentCacheControl,
  ChatRequest,
} from '@openrouter/sdk/models'
import type { OPENROUTER_CHAT_MODELS } from '../model-meta'

type OpenRouterChatModel = (typeof OPENROUTER_CHAT_MODELS)[number]

// ---------------------------------------------------------------------------
// Type aliases derived from the SDK's ChatRequest
// ---------------------------------------------------------------------------

export type ProviderPreferences = NonNullable<ChatRequest['provider']>

export type Plugin = NonNullable<ChatRequest['plugins']>[number]

export type WebPlugin = Extract<Plugin, { id: 'web' }>

export type PluginFileParser = Extract<Plugin, { id: 'file-parser' }>

export type PluginResponseHealing = Extract<Plugin, { id: 'response-healing' }>

export type PluginModeration = Extract<Plugin, { id: 'moderation' }>

export type PluginAutoRouter = Extract<Plugin, { id: 'auto-router' }>

export type PdfParserOptions = NonNullable<PluginFileParser['pdf']>

export type ReasoningOptions = NonNullable<ChatRequest['reasoning']>

export type StreamOptions = NonNullable<ChatRequest['streamOptions']>

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
  /**
   * A list of model IDs to use as fallbacks if the primary model is unavailable.
   */
  models?: Array<OpenRouterChatModel>
  /**
   * The model variant to use, if supported by the model.
   * Will be appended to the model ID.
   */
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
  | 'reasoning'
  | 'toolChoice'
  | 'parallelToolCalls'
>

export type ExternalTextProviderOptions = OpenRouterCommonOptions &
  OpenRouterBaseOptions

/**
 * Per-system-prompt metadata accepted on each `chat({ systemPrompts: [...] })`
 * entry (the `{ content, metadata }` object form).
 *
 * The only field is `cache_control`, OpenRouter's pass-through prompt-cache
 * directive. It is honoured by Anthropic-family models routed through
 * OpenRouter (the equivalent of calling Anthropic directly with a
 * `cache_control` breakpoint) and ignored by routes that don't support it —
 * OpenAI models, for instance, cache long prefixes automatically with no
 * request-side directive. The adapter forwards it onto the system message's
 * text content part on the wire; without it, the system prompt is sent as a
 * plain joined string exactly as before.
 *
 * @example
 *   import type { OpenRouterSystemPromptMetadata } from '@tanstack/ai-openrouter'
 *
 *   chat({
 *     adapter: openRouterText('anthropic/claude-sonnet-4.5'),
 *     systemPrompts: [
 *       {
 *         content: 'Large, stable instructions — cache me.',
 *         metadata: {
 *           cache_control: { type: 'ephemeral' },
 *         } satisfies OpenRouterSystemPromptMetadata,
 *       },
 *       'Volatile per-request instruction.',
 *     ],
 *   })
 */
export type OpenRouterSystemPromptMetadata = {
  cache_control?: ChatContentCacheControl
}
