import type { LovableTextProviderOptions } from './text-provider-options'

export type LovableResponsesProviderOptions = Pick<
  LovableTextProviderOptions,
  'temperature' | 'top_p' | 'max_output_tokens' | 'user'
>

export type ExternalResponsesProviderOptions = LovableResponsesProviderOptions
