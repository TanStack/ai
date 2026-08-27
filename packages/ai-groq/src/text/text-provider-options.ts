import type {
  ChatCompletionToolChoiceOption,
  CompoundCustom,
  Document,
  ResponseFormatJsonObject,
  ResponseFormatJsonSchema,
  ResponseFormatText,
  SearchSettings,
} from '../message-types'

export interface GroqTextProviderOptions {
  citation_options?: 'enabled' | 'disabled' | null

  /** Custom configuration of models and tools for Compound. */
  compound_custom?: CompoundCustom | null

  disable_tool_validation?: boolean

  documents?: Array<Document> | null

  frequency_penalty?: number | null

  include_reasoning?: boolean | null

  /** Modify the likelihood of specified tokens appearing in the completion. */
  logit_bias?: { [key: string]: number } | null

  logprobs?: boolean | null

  max_completion_tokens?: number | null

  /** Request metadata. */
  metadata?: { [key: string]: string } | null

  n?: number | null

  /** Whether to enable parallel function calling during tool use. */
  parallel_tool_calls?: boolean | null

  presence_penalty?: number | null

  reasoning_effort?: 'none' | 'default' | 'low' | 'medium' | 'high' | null

  reasoning_format?: 'hidden' | 'raw' | 'parsed' | null

  response_format?:
    | ResponseFormatText
    | ResponseFormatJsonSchema
    | ResponseFormatJsonObject
    | null

  /** Settings for web search functionality when the model uses a web search tool. */
  search_settings?: SearchSettings | null

  seed?: number | null

  service_tier?: 'auto' | 'on_demand' | 'flex' | 'performance' | null

  stop?: string | null | Array<string>

  /** Whether to store the request for future use. */
  store?: boolean | null

  temperature?: number | null

  tool_choice?: ChatCompletionToolChoiceOption | null

  top_logprobs?: number | null

  top_p?: number | null

  user?: string | null
}

export type ExternalTextProviderOptions = GroqTextProviderOptions
