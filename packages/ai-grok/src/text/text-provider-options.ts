import type { ResponseCreateParams } from 'openai/resources/responses/responses'

export type GrokReasoningEffort = 'none' | 'low' | 'medium' | 'high'

export type GrokReasoning = Omit<
  NonNullable<ResponseCreateParams['reasoning']>,
  'effort'
> & {
  effort?: GrokReasoningEffort
}

export interface GrokBaseOptions {
  user?: string
}

export interface GrokSamplingOptions {
  temperature?: number
  top_p?: number
  max_output_tokens?: number
  store?: boolean
  include?: ResponseCreateParams['include']
  reasoning?: GrokReasoning
}

export type GrokTextProviderOptions = GrokBaseOptions & GrokSamplingOptions

export type GrokBuildProviderOptions = Omit<
  GrokTextProviderOptions,
  'reasoning'
> & {
  reasoning?: never
}

export type ExternalTextProviderOptions = GrokTextProviderOptions
