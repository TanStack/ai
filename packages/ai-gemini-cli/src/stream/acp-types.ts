/**
 * Structural subset of the Agent Client Protocol (ACP) types that the
 * adapter consumes.
 *
 * These are intentionally defined structurally (rather than imported from
 * `@agentclientprotocol/sdk`) so the stream translator stays a pure,
 * fixture-testable state machine and the package's public types don't depend
 * on the ACP SDK's generated schema types. Unknown update types fall through
 * every branch at runtime.
 */

export type AcpContentBlock =
  | { type: 'text'; text: string }
  | { type: string; [key: string]: unknown }

export type AcpToolCallStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'

export interface AcpToolCallUpdate {
  toolCallId: string
  title?: string | null
  kind?: string | null
  status?: AcpToolCallStatus | null
  rawInput?: unknown
  rawOutput?: unknown
  content?: Array<{
    type: string
    content?: AcpContentBlock
    [key: string]: unknown
  }> | null
}

/**
 * The session-update variants the translator consumes. The harness can send
 * other update types (`available_commands_update`, `current_mode_update`,
 * ...); they fall through every branch and are ignored.
 */
export type AcpSessionUpdate =
  | { sessionUpdate: 'agent_message_chunk'; content: AcpContentBlock }
  | { sessionUpdate: 'agent_thought_chunk'; content: AcpContentBlock }
  | ({ sessionUpdate: 'tool_call' } & AcpToolCallUpdate)
  | ({ sessionUpdate: 'tool_call_update' } & AcpToolCallUpdate)
  | { sessionUpdate: 'plan'; entries: Array<unknown> }
  | { sessionUpdate: 'available_commands_update' }
  | { sessionUpdate: 'current_mode_update' }
  | { sessionUpdate: 'user_message_chunk'; content: AcpContentBlock }

export type AcpStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'max_turn_requests'
  | 'refusal'
  | 'cancelled'
  | (string & {})

/** Experimental per-turn token usage reported by the ACP prompt response. */
export interface AcpUsage {
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  cachedReadTokens?: number | null
  thoughtTokens?: number | null
}

export interface AcpPermissionOption {
  optionId: string
  name: string
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'
}

export interface AcpPermissionRequest {
  sessionId: string
  toolCall: AcpToolCallUpdate
  options: Array<AcpPermissionOption>
}

export type AcpPermissionOutcome =
  | { outcome: 'cancelled' }
  | { outcome: 'selected'; optionId: string }
