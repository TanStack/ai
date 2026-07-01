import type { ResponsesRequest } from '@openrouter/sdk/models'
import type { OPENROUTER_CHAT_MODELS } from '../model-meta'

type OpenRouterResponsesModel = (typeof OPENROUTER_CHAT_MODELS)[number]

// ---------------------------------------------------------------------------
// Composite option types for the OpenRouter Responses adapter.
// Derived from the SDK's `ResponsesRequest` so future SDK additions surface
// here without manual fan-out (mirrors `text-provider-options.ts`).
// ---------------------------------------------------------------------------

export type OpenRouterResponsesCommonOptions = Pick<
  ResponsesRequest,
  | 'provider'
  | 'plugins'
  | 'user'
  | 'sessionId'
  | 'metadata'
  | 'trace'
  | 'modalities'
  | 'serviceTier'
  | 'safetyIdentifier'
  | 'promptCacheKey'
  | 'previousResponseId'
  | 'imageConfig'
  | 'include'
  | 'maxToolCalls'
  | 'truncation'
> & {
  /** A list of model IDs to use as fallbacks if the primary model is unavailable. */
  models?: Array<OpenRouterResponsesModel>
  /** The model variant to use, if supported by the model. Appended to the model ID. */
  variant?: 'free' | 'nitro' | 'online' | 'exacto' | 'extended' | 'thinking'
}

// `parallelToolCalls` lives in BaseOptions alongside `toolChoice` (the other
// tool-related knob). Listing it in both picks would let an SDK rename of
// either pick still type-check through the survivor, defeating the static
// gate the picks exist for.
export type OpenRouterResponsesBaseOptions = Pick<
  ResponsesRequest,
  | 'maxOutputTokens'
  | 'temperature'
  | 'topP'
  | 'topK'
  | 'topLogprobs'
  | 'frequencyPenalty'
  | 'presencePenalty'
  | 'reasoning'
  | 'toolChoice'
  | 'parallelToolCalls'
  | 'text'
  | 'background'
  | 'prompt'
>

export type ExternalResponsesProviderOptions =
  OpenRouterResponsesCommonOptions & OpenRouterResponsesBaseOptions
