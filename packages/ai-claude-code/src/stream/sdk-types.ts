/**
 * Structural subset of the `@anthropic-ai/claude-agent-sdk` message types that
 * the stream translator consumes.
 *
 * These are intentionally defined structurally (rather than imported from the
 * agent SDK) so the translator stays a pure, fixture-testable state machine
 * and the package's public types don't depend on the agent SDK's bundled
 * `@anthropic-ai/sdk` type imports.
 */

export interface SdkInitMessage {
  type: 'system'
  subtype: 'init'
  session_id: string
  model: string
  tools: Array<string>
  cwd?: string
}

export type SdkAssistantContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: string; [key: string]: unknown }

export interface SdkAssistantMessage {
  type: 'assistant'
  message: {
    id?: string
    content: Array<SdkAssistantContentBlock>
  }
  parent_tool_use_id: string | null
}

export type SdkToolResultContent =
  | string
  | Array<{ type: string; text?: string; [key: string]: unknown }>

export type SdkUserContentBlock =
  | {
      type: 'tool_result'
      tool_use_id: string
      content?: SdkToolResultContent
      is_error?: boolean
    }
  | { type: string; [key: string]: unknown }

export interface SdkUserMessage {
  type: 'user'
  message: {
    role: 'user'
    content: string | Array<SdkUserContentBlock>
  }
  parent_tool_use_id: string | null
}

/** Raw Anthropic streaming events forwarded when `includePartialMessages` is set. */
export type SdkRawStreamEvent =
  | { type: 'message_start'; message: { id?: string } }
  | {
      type: 'content_block_start'
      index: number
      content_block: { type: string; id?: string; name?: string }
    }
  | {
      type: 'content_block_delta'
      index: number
      delta: {
        type: string
        text?: string
        thinking?: string
        partial_json?: string
      }
    }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta' }
  | { type: 'message_stop' }

export interface SdkPartialAssistantMessage {
  type: 'stream_event'
  event: SdkRawStreamEvent
  parent_tool_use_id: string | null
}

export interface SdkUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export interface SdkResultMessage {
  type: 'result'
  subtype:
    | 'success'
    | 'error_max_turns'
    | 'error_during_execution'
    | 'error_max_budget_usd'
    | 'error_max_structured_output_retries'
  result?: string
  errors?: Array<string>
  usage?: SdkUsage
  total_cost_usd?: number
  structured_output?: unknown
}

/**
 * Harness-internal system messages the translator deliberately ignores.
 * (The real SDK union has many more members; unknown runtime types simply
 * fall through every branch.)
 */
export interface SdkNoiseSystemMessage {
  type: 'system'
  subtype:
    | 'status'
    | 'permission_denied'
    | 'plugin_install'
    | 'session_state_changed'
    | 'task_notification'
    | 'task_progress'
}

/** Other harness-internal top-level message types the translator ignores. */
export interface SdkNoiseMessage {
  type:
    | 'tool_progress'
    | 'auth_status'
    | 'rate_limit_event'
    | 'prompt_suggestion'
    | 'compact_boundary'
}

export type AgentSdkMessage =
  | SdkInitMessage
  | SdkAssistantMessage
  | SdkUserMessage
  | SdkPartialAssistantMessage
  | SdkResultMessage
  | SdkNoiseSystemMessage
  | SdkNoiseMessage
