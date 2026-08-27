import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
  ResponseFormatJsonObject,
  ResponseFormatJsonSchema,
  ResponseFormatText,
} from '../message-types'

export interface MistralTextProviderOptions {
  temperature?: number | null

  top_p?: number | null

  max_tokens?: number | null

  stop?: string | Array<string> | null

  random_seed?: number | null

  response_format?:
    | ResponseFormatText
    | ResponseFormatJsonSchema
    | ResponseFormatJsonObject
    | null

  tool_choice?: ChatCompletionToolChoiceOption | null

  parallel_tool_calls?: boolean | null

  frequency_penalty?: number | null

  presence_penalty?: number | null

  n?: number | null

  prediction?: { type: 'content'; content: string } | null

  safe_prompt?: boolean | null
}

export interface InternalTextProviderOptions extends MistralTextProviderOptions {
  messages: Array<ChatCompletionMessageParam>
  model: string
  stream?: boolean | null
  tools?: Array<ChatCompletionTool>
}

export type ExternalTextProviderOptions = MistralTextProviderOptions
