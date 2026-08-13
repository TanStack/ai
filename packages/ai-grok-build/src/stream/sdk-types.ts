/**
 * Structural event types emitted by the Grok Build harness CLI (NDJSON).
 *
 * The real `grok --output-format streaming-json` CLI emits the **native**
 * shapes (`thought`, `text`, `end`). Tool execution is narrated inside
 * `thought` — there are no separate tool-call events in this format (use
 * `grok agent stdio` / ACP for structured `tool_call` updates). The
 * **legacy** Codex-like shapes below are kept for fixture tests and backward
 * compatibility.
 */

export interface GrokBuildUsage {
  input_tokens?: number
  output_tokens?: number
  cached_input_tokens?: number
}

/** Native streaming-json events from `grok -p … --output-format streaming-json`. */
export type GrokBuildNativeEvent =
  | { type: 'thought'; data: string }
  | { type: 'text'; data: string }
  | {
      type: 'end'
      stopReason?: string
      sessionId?: string
      requestId?: string
    }
  | { type: 'error'; message: string }

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

/** Legacy Codex-like events (fixture tests / older harness builds). */
export type GrokBuildThreadEvent =
  | { type: 'thread.started'; thread_id: string }
  | { type: 'turn.started' }
  | { type: 'turn.completed'; usage?: GrokBuildUsage }
  | { type: 'turn.failed'; error?: { message?: string } }
  | { type: 'item.started'; item: GrokBuildThreadItem }
  | { type: 'item.updated'; item: GrokBuildThreadItem }
  | { type: 'item.completed'; item: GrokBuildThreadItem }
  | { type: 'error'; message: string }

/** Any NDJSON line the adapter may receive from the harness stdout. */
export type GrokBuildStreamEvent = GrokBuildNativeEvent | GrokBuildThreadEvent
