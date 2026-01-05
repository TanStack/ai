import type { Options, Tool, ToolCall } from 'ollama'

export interface OllamaModelMeta<TModelOptions = unknown> {
  name: string
  modelOptions?: TModelOptions
  supports?: {
    input?: Array<'text' | 'image' | 'video'>
    output?: Array<'text' | 'image' | 'video'>
    capabilities?: Array<'tools' | 'thinking' | 'vision' | 'embedding'>
  }
  size?: string
  context?: number
}

// interface ChatRequest {
//   model: string
//   messages?: Message[]
//   stream?: boolean
//   format?: string | object
//   keep_alive?: string | number
//   tools?: Tool[]
//   think?: boolean | 'high' | 'medium' | 'low'
//   logprobs?: boolean
//   top_logprobs?: number
//   options?: Partial<Options>
// }

export interface OllamaChatRequest {
  // model: string
  //   messages?: Message[]
  stream?: boolean
  format?: string | object
  keep_alive?: string | number
  //   tools?: Tool[]
  //   think?: boolean | 'high' | 'medium' | 'low'
  logprobs?: boolean
  top_logprobs?: number
  options?: Partial<Options>
}

export interface OllamaChatRequestThinking {
  think?: boolean
}

export interface OllamaChatRequestThinking_OpenAI {
  think?: 'low' | 'medium' | 'high'
}

export interface OllamaChatRequestTools {
  tools?: Array<Tool>
}

// interface Message {
//   role: string
//   content: string
//   thinking?: string
//   images?: Uint8Array[] | string[]
//   tool_calls?: ToolCall[]
//   tool_name?: string
// }

export interface OllamaChatRequestMessages<
  TMessageExtension extends OllamaMessageExtension = {},
> {
  messages?: Array<
    {
      role: string
      content: string
      //   thinking?: string
      //   images?: Uint8Array[] | string[]
      //   tool_calls?: ToolCall[]
      //   tool_name?: string
    } & TMessageExtension
  >
}

export interface OllamaMessageThinking {
  thinking?: string
}

export interface OllamaMessageImages {
  images?: Array<Uint8Array> | Array<string>
}

export interface OllamaMessageTools {
  tool_calls?: Array<ToolCall>
  tool_name?: string
}

type OllamaMessageExtension =
  | Partial<OllamaMessageThinking & OllamaMessageImages & OllamaMessageTools>
  | undefined
