/**
 * Local wire-format types for the OpenAI Chat Completions API.
 *
 * These are not a full clone of `openai`'s types — only the fields the base
 * adapter reads/writes and the public abstract-method surface subclasses
 * must satisfy. Structural compatibility means subclasses can still hand the
 * openai SDK's own `ChatCompletion` / `ChatCompletionChunk` objects to the
 * base without conversion: the SDK shapes are supersets of ours.
 *
 * Open-ended index signatures (`[key: string]: unknown`) on request and
 * message shapes let subclasses spread their own SDK params / message shapes
 * through `modelOptions` without TS complaining about unknown fields.
 */

export interface ChatCompletionTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
    strict?: boolean | null
  }
}

export interface ChatCompletionContentPartText {
  type: 'text'
  text: string
}

export interface ChatCompletionContentPartImage {
  type: 'image_url'
  image_url: {
    url: string
    detail?: 'auto' | 'low' | 'high'
  }
}

export interface ChatCompletionContentPartInputAudio {
  type: 'input_audio'
  input_audio: {
    data: string
    format: 'wav' | 'mp3'
  }
}

export interface ChatCompletionContentPartFile {
  type: 'file'
  file: {
    file_data?: string
    file_id?: string
    filename?: string
  }
}

export type ChatCompletionContentPart =
  | ChatCompletionContentPartText
  | ChatCompletionContentPartImage
  | ChatCompletionContentPartInputAudio
  | ChatCompletionContentPartFile

export interface ChatCompletionSystemMessageParam {
  role: 'system'
  content: string | Array<ChatCompletionContentPartText>
  name?: string
}

export interface ChatCompletionUserMessageParam {
  role: 'user'
  content: string | Array<ChatCompletionContentPart>
  name?: string
}

export interface ChatCompletionMessageFunctionToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ChatCompletionMessageCustomToolCall {
  id: string
  type: 'custom'
  custom: {
    name: string
    input: string
  }
}

export type ChatCompletionMessageToolCall =
  | ChatCompletionMessageFunctionToolCall
  | ChatCompletionMessageCustomToolCall

export interface ChatCompletionAssistantMessageParam {
  role: 'assistant'
  content?: string | Array<ChatCompletionContentPartText> | null
  name?: string
  tool_calls?: Array<ChatCompletionMessageToolCall>
  refusal?: string | null
}

export interface ChatCompletionToolMessageParam {
  role: 'tool'
  content: string | Array<ChatCompletionContentPartText>
  tool_call_id: string
}

export interface ChatCompletionDeveloperMessageParam {
  role: 'developer'
  content: string | Array<ChatCompletionContentPartText>
  name?: string
}

export type ChatCompletionMessageParam =
  | ChatCompletionSystemMessageParam
  | ChatCompletionUserMessageParam
  | ChatCompletionAssistantMessageParam
  | ChatCompletionToolMessageParam
  | ChatCompletionDeveloperMessageParam

export type ChatCompletionToolChoiceOption =
  | 'none'
  | 'auto'
  | 'required'
  | {
      type: 'function'
      function: { name: string }
    }

export interface ChatCompletionStreamOptions {
  include_usage?: boolean
}

export interface ChatCompletionCreateParamsBase {
  model: string
  messages: Array<ChatCompletionMessageParam>
  temperature?: number | null
  top_p?: number | null
  max_tokens?: number | null
  max_completion_tokens?: number | null
  n?: number | null
  tools?: Array<ChatCompletionTool>
  tool_choice?: ChatCompletionToolChoiceOption
  response_format?:
    | { type: 'text' }
    | { type: 'json_object' }
    | {
        type: 'json_schema'
        json_schema: {
          name: string
          description?: string
          schema?: Record<string, unknown>
          strict?: boolean | null
        }
      }
  stream_options?: ChatCompletionStreamOptions | null
  user?: string
  metadata?: Record<string, string> | null
}

export interface ChatCompletionCreateParamsNonStreaming
  extends ChatCompletionCreateParamsBase {
  stream?: false | null
}

export interface ChatCompletionCreateParamsStreaming
  extends ChatCompletionCreateParamsBase {
  stream: true
}

export interface CompletionUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface ChatCompletionMessage {
  role: 'assistant'
  content: string | null
  refusal?: string | null
  tool_calls?: Array<ChatCompletionMessageToolCall>
}

export interface ChatCompletion {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: Array<{
    index: number
    message: ChatCompletionMessage
    finish_reason: ChatCompletionFinishReason | null
    logprobs?: unknown
  }>
  usage?: CompletionUsage | null
  system_fingerprint?: string
}

export type ChatCompletionFinishReason =
  | 'stop'
  | 'length'
  | 'tool_calls'
  | 'content_filter'
  | 'function_call'

export interface ChatCompletionChunkChoiceDeltaToolCall {
  index: number
  id?: string
  type?: 'function'
  function?: {
    name?: string
    arguments?: string
  }
}

export interface ChatCompletionChunkChoiceDelta {
  role?: 'system' | 'user' | 'assistant' | 'tool' | 'developer'
  content?: string | null
  tool_calls?: Array<ChatCompletionChunkChoiceDeltaToolCall>
  refusal?: string | null
}

export interface ChatCompletionChunkChoice {
  index: number
  delta: ChatCompletionChunkChoiceDelta
  finish_reason: ChatCompletionFinishReason | null
  logprobs?: unknown
}

export interface ChatCompletionChunk {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: Array<ChatCompletionChunkChoice>
  usage?: CompletionUsage | null
  system_fingerprint?: string
}
