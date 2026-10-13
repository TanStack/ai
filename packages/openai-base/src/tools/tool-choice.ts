import type { ToolChoice as CoreToolChoice } from '@tanstack/ai'

/**
 * Maps the `chat({ toolChoice })` value to the Chat Completions
 * `tool_choice` wire value.
 */
export function toChatCompletionsToolChoice(choice: CoreToolChoice) {
  if (typeof choice === 'string') return choice
  return { type: 'function' as const, function: { name: choice.name } }
}

/**
 * Maps the `chat({ toolChoice })` value to the Responses `tool_choice` wire
 * value.
 */
export function toResponsesToolChoice(choice: CoreToolChoice) {
  if (typeof choice === 'string') return choice
  return { type: 'function' as const, name: choice.name }
}

interface MCPToolChoice {
  type: 'mcp'
  server_label: string
}

interface FunctionToolChoice {
  type: 'function'
  name: string
}

interface CustomToolChoice {
  type: 'custom'
  name: string
}

interface HostedToolChoice {
  type:
    | 'file_search'
    | 'web_search_preview'
    | 'computer_use_preview'
    | 'code_interpreter'
    | 'image_generation'
    | 'shell'
    | 'apply_patch'
}

export type ToolChoice =
  | MCPToolChoice
  | FunctionToolChoice
  | CustomToolChoice
  | HostedToolChoice
