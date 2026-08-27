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

export interface OpencodeAssistantMessage {
  id: string
  role: 'assistant'
  finish?: string
  error?: OpencodeMessageError
  tokens?: OpencodeTokens
  cost?: number
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

export type OpencodeStreamEvent =
  | { kind: 'session'; sessionId: string }
  | { kind: 'event'; event: OpencodeEvent }
  | { kind: 'done'; message: OpencodeAssistantMessage }
