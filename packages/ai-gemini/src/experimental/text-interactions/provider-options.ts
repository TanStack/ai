import type { Interactions } from '@google/genai'

export type ExternalTextInteractionsProviderOptions = Pick<
  Interactions.CreateModelInteractionParamsStreaming,
  | 'previous_interaction_id'
  | 'store'
  | 'background'
  | 'system_instruction'
  | 'response_modalities'
  | 'response_format'
  | 'generation_config'
>
