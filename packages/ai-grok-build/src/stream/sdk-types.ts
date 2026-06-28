/**
 * Structural event types emitted by the Grok Build harness CLI (NDJSON).
 *
 * These are intentionally defined structurally so the translator stays a
 * pure, fixture-testable state machine and the package does not depend on
 * any external SDK types.
 */

export interface GrokBuildUsage {
  input_tokens?: number
  output_tokens?: number
  cached_input_tokens?: number
}

export type GrokBuildToolItem =
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
      result?: { content?: Array<{ type: string; text?: string }> }
      error?: { message: string }
      status: string
    }

export type GrokBuildThreadItem =
  | { id: string; type: 'agent_message'; text: string }
  | { id: string; type: 'reasoning'; text: string }
  | GrokBuildToolItem
  | { id: string; type: 'web_search'; query: string }
  | { id: string; type: 'error'; message: string }

export type GrokBuildThreadEvent =
  | { type: 'thread.started'; thread_id: string }
  | { type: 'turn.started' }
  | { type: 'turn.completed'; usage?: GrokBuildUsage }
  | { type: 'turn.failed'; error?: { message?: string } }
  | { type: 'item.started'; item: GrokBuildThreadItem }
  | { type: 'item.updated'; item: GrokBuildThreadItem }
  | { type: 'item.completed'; item: GrokBuildThreadItem }
  | { type: 'error'; message: string }
