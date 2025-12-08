export interface WebPlugin {
  id: 'web'
  engine?: 'native' | 'exa'
  max_results?: number
  search_prompt?: string
}

export interface ProviderPreferences {
  order?: Array<string>
  allow_fallbacks?: boolean
  require_parameters?: boolean
  data_collection?: 'allow' | 'deny'
  zdr?: boolean
  only?: Array<string>
  ignore?: Array<string>
  quantizations?: Array<string>
  sort?: 'price' | 'throughput'
  max_price?: {
    completion_tokens?: number
    prompt_tokens?: number
  }
}

export interface ReasoningOptions {
  effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high'
  max_tokens?: number
  exclude?: boolean
}

export interface StreamOptions {
  include_usage?: boolean
}

export interface ImageConfig {
  aspect_ratio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | string
}

export interface OpenRouterBaseOptions {
  stop?: string | Array<string>
  stream?: boolean
  max_tokens?: number
  max_completion_tokens?: number
  temperature?: number
  top_p?: number
  top_k?: number
  frequency_penalty?: number
  presence_penalty?: number
  repetition_penalty?: number
  logit_bias?: { [key: number]: number }
  logprobs?: boolean
  top_logprobs?: number
  min_p?: number
  top_a?: number
  seed?: number
  response_format?: { type: 'json_object' }
  transforms?: Array<string>
  models?: Array<string>
  route?: 'fallback'
  provider?: ProviderPreferences
  user?: string
  metadata?: Record<string, string>
  prediction?: {
    type: 'content'
    content: string
  }
  reasoning?: ReasoningOptions
  stream_options?: StreamOptions
  parallel_tool_calls?: boolean
  verbosity?: 'low' | 'medium' | 'high'
  modalities?: Array<'text' | 'image'>
  image_config?: ImageConfig
  tool_choice?:
    | 'none'
    | 'auto'
    | 'required'
    | {
        type: 'function'
        function: {
          name: string
        }
      }
  plugins?: Array<WebPlugin>
  debug?: {
    echo_upstream_body?: boolean
  }
}

export type ExternalTextProviderOptions = OpenRouterBaseOptions

export interface InternalTextProviderOptions
  extends ExternalTextProviderOptions {
  model: string
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool'
    content:
      | string
      | Array<{
          type: 'text' | 'image_url'
          text?: string
          image_url?: {
            url: string
            detail?: 'auto' | 'low' | 'high'
          }
        }>
    tool_call_id?: string
    name?: string
  }>
  tools?: Array<{
    type: 'function'
    function: {
      name: string
      description?: string
      parameters: Record<string, unknown>
    }
  }>
  tool_choice?:
    | 'none'
    | 'auto'
    | 'required'
    | {
        type: 'function'
        function: {
          name: string
        }
      }
}
