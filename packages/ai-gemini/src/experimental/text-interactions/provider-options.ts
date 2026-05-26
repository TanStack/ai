import type { Interactions } from '@google/genai'

/**
 * Provider options for `geminiTextInteractions()`. Derived from the SDK's
 * own `interactions.create` param shape so field types (including the
 * allowed `response_modalities` values and the `generation_config` schema)
 * stay in sync with `@google/genai` automatically.
 *
 * `input`, `model`, `tools`, `stream`, and `api_version` are intentionally
 * omitted — the adapter derives those from its constructor args and the
 * chat options.
 *
 * @see https://ai.google.dev/gemini-api/docs/interactions
 * @experimental Interactions API is in Beta.
 */
export type ExternalTextInteractionsProviderOptions = Pick<
  Interactions.CreateModelInteractionParamsStreaming,
  | 'previous_interaction_id'
  | 'store'
  | 'background'
  | 'system_instruction'
  | 'response_modalities'
  | 'response_format'
  | 'response_mime_type'
  | 'generation_config'
>
