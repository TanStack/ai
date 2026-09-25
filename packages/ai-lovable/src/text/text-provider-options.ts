export interface LovableTextProviderOptions {
  temperature?: number | null
  top_p?: number | null
  max_tokens?: number | null
  max_completion_tokens?: number | null
  max_output_tokens?: number | null
  frequency_penalty?: number | null
  presence_penalty?: number | null
  stop?: string | null | Array<string>
  seed?: number | null
  reasoning?: boolean | Record<string, unknown> | null
  include_reasoning?: boolean | null
  response_format?: unknown
  structured_outputs?: boolean | null
  user?: string | null
}

export type ExternalTextProviderOptions = LovableTextProviderOptions
