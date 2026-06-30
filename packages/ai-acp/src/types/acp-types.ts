/**
 * Structural subset of the Agent Client Protocol (ACP) types that harness
 * adapters consume.
 *
 * Defined structurally (rather than imported from `@agentclientprotocol/sdk`)
 * so the stream translator stays a pure, fixture-testable state machine.
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

export type AcpPermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'

export type PermissionHandler = (
  request: AcpPermissionRequest,
) => Promise<AcpPermissionOutcome> | AcpPermissionOutcome