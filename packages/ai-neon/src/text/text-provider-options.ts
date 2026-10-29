import type { ChatCompletionCreateParamsBase } from 'openai/resources/chat/completions'
import type { ResponseCreateParamsBase } from 'openai/resources/responses/responses'

/**
 * Model options for the Chat Completions route (`/v1/chat/completions`): the
 * standard Chat Completions parameters. The gateway caps output with
 * `max_tokens`. `chat({ reasoning })` sets `reasoning_effort`, and
 * `chat({ toolChoice })` sets `tool_choice`.
 */
export type NeonTextProviderOptions = Pick<
  ChatCompletionCreateParamsBase,
  | 'frequency_penalty'
  | 'max_completion_tokens'
  | 'max_tokens'
  | 'parallel_tool_calls'
  | 'presence_penalty'
  | 'seed'
  | 'stop'
  | 'temperature'
  | 'top_p'
  | 'user'
>

/** Model options for the Responses route (`/openai/v1/responses`). */
export type NeonResponsesProviderOptions = Pick<
  ResponseCreateParamsBase,
  | 'max_output_tokens'
  | 'parallel_tool_calls'
  | 'temperature'
  | 'top_p'
  | 'truncation'
  | 'user'
>
