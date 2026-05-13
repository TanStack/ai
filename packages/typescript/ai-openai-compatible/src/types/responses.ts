/**
 * Local wire-format types for the OpenAI Responses API.
 *
 * Same philosophy as `chat-completions.ts`: model only the fields the base
 * adapter reads/writes plus the abstract surface subclasses must satisfy.
 * Structural compatibility means subclasses can still hand the openai SDK's
 * `ResponseStreamEvent` discriminated union into the base — each openai
 * variant is a subtype of one of ours, or falls through into the catch-all
 * `{ type: string }` arm we never narrow on.
 */

import type { Tool } from '@tanstack/ai'

export interface ResponseInputText {
  type: 'input_text'
  text: string
}

export interface ResponseInputImage {
  type: 'input_image'
  image_url?: string
  file_id?: string
  detail?: 'auto' | 'low' | 'high'
}

export interface ResponseInputFile {
  type: 'input_file'
  file_id?: string
  file_url?: string
  file_data?: string
  filename?: string
}

export type ResponseInputContent =
  | ResponseInputText
  | ResponseInputImage
  | ResponseInputFile

export interface ResponseInputMessage {
  type?: 'message'
  role: 'user' | 'assistant' | 'system' | 'developer'
  content: string | Array<ResponseInputContent>
}

export interface ResponseFunctionToolCallInput {
  type: 'function_call'
  call_id: string
  name: string
  arguments: string
}

export interface ResponseFunctionCallOutput {
  type: 'function_call_output'
  call_id: string
  output: string
}

export type ResponseInputItem =
  | ResponseInputMessage
  | ResponseFunctionToolCallInput
  | ResponseFunctionCallOutput

export type ResponseInput = Array<ResponseInputItem>

export interface ResponseOutputText {
  type: 'output_text'
  text: string
  annotations?: Array<unknown>
}

export interface ResponseOutputRefusal {
  type: 'refusal'
  refusal: string
}

export interface ResponseOutputReasoningText {
  type: 'reasoning_text'
  text: string
}

export type ResponseOutputContent =
  | ResponseOutputText
  | ResponseOutputRefusal
  | ResponseOutputReasoningText

/**
 * A single item in `Response.output`. The Responses API returns ~12 variants
 * (message, function_call, reasoning, file_search_call, web_search_call,
 * computer_call, image_generation_call, code_interpreter_call, mcp_call,
 * local_shell_call, etc.); we model it as a loose interface because the
 * base reads heterogeneous optional fields (`id`, `name`, `arguments`,
 * `content`) across multiple variants without discriminated narrowing.
 *
 * Subclasses passing the openai SDK's richer discriminated union satisfy
 * this shape structurally.
 */
export interface ResponseOutputItem {
  type: string
  id?: string
  name?: string
  arguments?: string
  call_id?: string
  status?: string
  role?: 'assistant'
  // The base only iterates `content` after narrowing on `type === 'message'`,
  // where the wire format guarantees it. Modelling it as required keeps the
  // narrowed access free of `if (content)` guards in the base; non-message
  // items just won't carry it at runtime — the base doesn't reach for it.
  content: Array<ResponseOutputContent>
}

export interface ResponseUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

export interface Response {
  id: string
  object: 'response'
  created_at: number
  model: string
  status?: string
  output: Array<ResponseOutputItem>
  usage?: ResponseUsage
  error: { message: string; code?: string } | null
  incomplete_details: { reason: string } | null
}

export interface ResponseCreateParamsBase {
  model: string
  input: string | ResponseInput
  instructions?: string | null
  temperature?: number | null
  top_p?: number | null
  max_output_tokens?: number | null
  metadata?: Record<string, string> | null
  tools?: Array<unknown>
  tool_choice?: unknown
  /** Response-format config (json_schema lives here on the Responses API,
   * unlike `response_format` on Chat Completions). */
  text?: {
    format?:
      | { type: 'text' }
      | { type: 'json_object' }
      | {
          type: 'json_schema'
          name: string
          description?: string
          schema?: Record<string, unknown>
          strict?: boolean | null
        }
  }
}

export interface ResponseCreateParamsNonStreaming
  extends ResponseCreateParamsBase {
  stream?: false | null
}

export interface ResponseCreateParamsStreaming extends ResponseCreateParamsBase {
  stream: true
}

export type ResponseCreateParams =
  | ResponseCreateParamsNonStreaming
  | ResponseCreateParamsStreaming

/**
 * Streamed events from the Responses API. Modelled as a discriminated union
 * over the `type` literal: variants the base narrows on declare every field
 * it requires for that branch, so accessing `chunk.response.model` after a
 * `chunk.type === 'response.failed'` check typechecks without a guard.
 *
 * The trailing `{ type: string }` arm is the catch-all for event types the
 * base never tests — openai's SDK union has many we ignore (web_search_call.*,
 * file_search_call.*, mcp_call.*, etc.). Subclasses can still pass openai's
 * full union here; each openai variant is structurally assignable to one of
 * ours or the catch-all.
 */
export type ResponseStreamEvent =
  | {
      type: 'response.created'
      response: Response
      sequence_number?: number
    }
  | {
      type: 'response.in_progress'
      response: Response
      sequence_number?: number
    }
  | {
      type: 'response.failed'
      response: Response
      sequence_number?: number
    }
  | {
      type: 'response.incomplete'
      response: Response
      sequence_number?: number
    }
  | {
      type: 'response.completed'
      response: Response
      sequence_number?: number
    }
  | {
      type: 'response.output_text.delta'
      delta: string | Array<string>
      item_id: string
      output_index: number
      content_index: number
      sequence_number?: number
    }
  | {
      type: 'response.reasoning_text.delta'
      delta: string | Array<string>
      item_id: string
      output_index: number
      content_index: number
      sequence_number?: number
    }
  | {
      type: 'response.reasoning_summary_text.delta'
      delta: string
      item_id?: string
      output_index?: number
      summary_index?: number
      sequence_number?: number
    }
  | {
      type: 'response.content_part.added'
      part: ResponseOutputContent
      item_id: string
      output_index: number
      content_index: number
      sequence_number?: number
    }
  | {
      type: 'response.content_part.done'
      part: ResponseOutputContent
      item_id: string
      output_index: number
      content_index: number
      sequence_number?: number
    }
  | {
      type: 'response.output_item.added'
      item: ResponseOutputItem
      output_index: number
      sequence_number?: number
    }
  | {
      type: 'response.output_item.done'
      item: ResponseOutputItem
      output_index: number
      sequence_number?: number
    }
  | {
      type: 'response.function_call_arguments.delta'
      delta: string
      item_id: string
      output_index: number
      sequence_number?: number
    }
  | {
      type: 'response.function_call_arguments.done'
      arguments: string
      item_id: string
      output_index: number
      sequence_number?: number
    }
  | {
      type: 'error'
      message: string
      code?: string
      sequence_number?: number
    }

// Re-export the framework `Tool` only because subclass call sites
// frequently import it alongside Responses types — no semantic dependency.
export type { Tool }
