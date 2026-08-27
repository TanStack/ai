/**
 * Bedrock Chat Completions provider options. Bedrock accepts the standard
 * OpenAI Chat Completions request fields; we surface the commonly-used ones
 * plus `reasoning_effort` (supported by gpt-oss and reasoning models).
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-openai.html
 */
export interface BedrockTextProviderOptions {
  frequency_penalty?: number | null
  presence_penalty?: number | null
  logit_bias?: { [token: string]: number } | null
  logprobs?: boolean | null
  top_logprobs?: number | null
  max_completion_tokens?: number | null
  metadata?: { [key: string]: string } | null
  n?: number | null
  parallel_tool_calls?: boolean | null
  /** gpt-oss / reasoning models: 'low' | 'medium' (default) | 'high'. */
  reasoning_effort?: 'low' | 'medium' | 'high' | null
  seed?: number | null
  stop?: string | Array<string> | null
  temperature?: number | null
  tool_choice?:
    | 'none'
    | 'auto'
    | 'required'
    | { type: 'function'; function: { name: string } }
    | null
  top_p?: number | null
  user?: string | null
}

export type ExternalTextProviderOptions = BedrockTextProviderOptions
