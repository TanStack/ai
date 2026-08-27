import type {
  ChatCompletionToolChoiceOption,
  ResponseFormatJsonObject,
  ResponseFormatJsonSchema,
  ResponseFormatText,
} from '../message-types'

export interface LLMGatewayTextProviderOptions {
  frequency_penalty?: number | null

  max_tokens?: number | null

  max_completion_tokens?: number | null

  /** Whether to enable parallel function calling during tool use. */
  parallel_tool_calls?: boolean | null

  presence_penalty?: number | null

  reasoning_effort?:
    | 'none'
    | 'minimal'
    | 'low'
    | 'medium'
    | 'high'
    | 'xhigh'
    | 'max'
    | null

  response_format?:
    | ResponseFormatText
    | ResponseFormatJsonSchema
    | ResponseFormatJsonObject
    | null

  seed?: number | null

  stop?: string | null | Array<string>

  temperature?: number | null

  tool_choice?: ChatCompletionToolChoiceOption | null

  top_p?: number | null

  user?: string | null
}

export type ExternalTextProviderOptions = LLMGatewayTextProviderOptions
