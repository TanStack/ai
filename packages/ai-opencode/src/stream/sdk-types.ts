/**
 * Structural subset of the `@opencode-ai/sdk` event types that the stream
 * translator consumes.
 *
 * These are intentionally defined structurally (rather than imported from the
 * OpenCode SDK) so the translator stays a pure, fixture-testable state machine
 * and the package's public types don't depend on the SDK's generated schema
 * types. Unknown part or event types fall through every branch at runtime.
 */

export interface OpencodeTokens {
  input?: number
  output?: number
  reasoning?: number
  cache?: { read?: number; write?: number }
}

/** Error payload attached to a failed assistant message. */
export interface OpencodeMessageError {
  name: string
  data?: { message?: string }
}

/**
 * The final assistant message of a turn, returned by the blocking prompt
 * call. Carries the finish reason, token usage, and any fatal error.
 */
export interface OpencodeAssistantMessage {
  id: string
  role: 'assistant'
  finish?: string
  error?: OpencodeMessageError
  tokens?: OpencodeTokens
  cost?: number
  /**
   * Schema-constrained result when the turn was prompted with a `json_schema`
   * output format (`chat({ outputSchema })`). Mirrors the SDK's
   * `AssistantMessage.structured`.
   */
  structured?: unknown
}

export type OpencodeToolState =
  | { status: 'pending'; input?: Record<string, unknown> }
  | {
      status: 'running'
      input?: Record<string, unknown>
      title?: string
    }
  | {
      status: 'completed'
      input?: Record<string, unknown>
      output: string
      title?: string
    }
  | { status: 'error'; input?: Record<string, unknown>; error: string }

/**
 * The OpenCode message-part kinds the translator understands. The trailing
 * catch-all member keeps the union open to other kinds (file, step-start,
 * step-finish, snapshot, patch, agent, ...); the translator dispatches via
 * the `is*Part` type guards, so those kinds simply match no guard.
 */
export type OpencodePart =
  | { id: string; sessionID?: string; type: 'text'; text: string }
  | { id: string; sessionID?: string; type: 'reasoning'; text: string }
  | {
      id: string
      sessionID?: string
      type: 'tool'
      callID: string
      tool: string
      state: OpencodeToolState
    }
  | { id: string; sessionID?: string; type: string }

/**
 * The OpenCode events the translator understands. This is a closed
 * discriminated union (so `event.type` narrows cleanly); the server forwards
 * raw SDK events cast to this type, and any event whose `type` isn't listed
 * here simply matches no branch and is ignored at runtime.
 */
export type OpencodeEvent =
  | {
      type: 'message.part.updated'
      properties: { part: OpencodePart; delta?: string }
    }
  | {
      type: 'message.updated'
      properties: { info: { sessionID?: string } }
    }
  | { type: 'session.idle'; properties: { sessionID: string } }
  | {
      type: 'session.error'
      properties: { sessionID?: string; error?: OpencodeMessageError }
    }
  | {
      type: 'todo.updated'
      properties: { sessionID: string; todos: Array<unknown> }
    }

/**
 * Events fed to the translator: the session id once established, every
 * session-scoped OpenCode event, and a terminal `done` carrying the final
 * assistant message (the adapter's async queue produces these).
 */
export type OpencodeStreamEvent =
  | { kind: 'session'; sessionId: string }
  | { kind: 'event'; event: OpencodeEvent }
  | { kind: 'done'; message: OpencodeAssistantMessage }
