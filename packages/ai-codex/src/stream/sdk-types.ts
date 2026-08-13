/**
 * Structural subset of the `@openai/codex-sdk` event types that the stream
 * translator consumes.
 *
 * These are intentionally defined structurally (rather than imported from the
 * Codex SDK) so the translator stays a pure, fixture-testable state machine
 * and the package's public types don't depend on the SDK's type exports.
 * Unknown item or event types fall through every branch at runtime.
 */

export interface CodexUsage {
  input_tokens?: number
  cached_input_tokens?: number
  output_tokens?: number
  reasoning_output_tokens?: number
}

export interface CodexMcpToolCallResult {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>
  structured_content?: unknown
}

export type CodexThreadItem =
  | { id: string; type: 'agent_message'; text: string }
  | { id: string; type: 'reasoning'; text: string }
  | {
      id: string
      type: 'command_execution'
      command: string
      aggregated_output?: string
      exit_code?: number
      status: string
    }
  | {
      id: string
      type: 'file_change'
      changes: Array<{ path: string; kind: string }>
      status: string
    }
  | {
      id: string
      type: 'mcp_tool_call'
      server: string
      tool: string
      arguments?: unknown
      result?: CodexMcpToolCallResult
      error?: { message: string }
      status: string
    }
  | { id: string; type: 'web_search'; query: string }
  | {
      id: string
      type: 'todo_list'
      items: Array<{ text: string; completed: boolean }>
    }
  | { id: string; type: 'error'; message: string }

export type CodexThreadEvent =
  | { type: 'thread.started'; thread_id: string }
  | { type: 'turn.started' }
  | { type: 'turn.completed'; usage?: CodexUsage }
  | { type: 'turn.failed'; error?: { message?: string } }
  | { type: 'item.started'; item: CodexThreadItem }
  | { type: 'item.updated'; item: CodexThreadItem }
  | { type: 'item.completed'; item: CodexThreadItem }
  | { type: 'error'; message: string }
