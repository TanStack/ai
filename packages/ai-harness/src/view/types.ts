import type { ConfigOption } from '../config'
import type { MediaKind, Receipt } from '../types'

export type ToolCallStatus = 'running' | 'done' | 'failed' | 'needs-approval'

export interface ToolCallPart {
  type: 'tool-call'
  id: string
  name: string
  /** The raw JSON arguments as they stream. */
  argsText: string
  /** The parsed arguments, after the call ends. */
  args: unknown
  status: ToolCallStatus
  result?: unknown
}

/** A child agent, with its own text and tool calls. */
export interface AgentPart {
  type: 'agent'
  id: string
  name: string
  status: 'running' | 'done' | 'failed'
  error?: string
  parts: Array<ViewPart>
}

/** A media file that the user sent or that an agent made. */
export interface MediaPart {
  type: 'media'
  id: string
  kind: MediaKind
  mimeType: string
  name: string
  /** Size in bytes. */
  size: number
  /**
   * A URL for `<img>`, `<audio>`, or `<video>`, when the source gives one.
   * The view gets a new one before it expires.
   */
  url?: string
  /** Read the bytes. Rejects when the source cannot load media. */
  load: () => Promise<Uint8Array>
}

export type ViewPart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | ToolCallPart
  | AgentPart
  | MediaPart

/** Why a notice line is there. */
export type NoticeKind = 'info' | 'error' | 'rejected' | 'command' | 'ui'

export type ViewMessage =
  | {
      id: string
      role: 'user'
      text: string
      /** The files the user sent, when there are any. */
      media?: Array<MediaPart>
    }
  | { id: string; role: 'assistant'; parts: Array<ViewPart> }
  | { id: string; role: 'notice'; kind: NoticeKind; text: string }

/** A tool call that waits for a yes or no. */
export interface Approval {
  id: string
  toolCallId?: string
  tool: string
  args: unknown
  message?: string
  approve: () => void
  reject: () => void
}

/** A question from a command or a plugin. */
export interface ViewQuestion {
  id: string
  message: string
  /** The answer's JSON Schema, when the question has one. */
  schema?: unknown
  answer: (value: unknown) => Promise<Receipt>
}

/** A connector that needs a sign-in. */
export interface SignIn {
  connector: string
  url?: string
  userCode?: string
}

export interface ViewCommand {
  name: string
  description: string
  owner: string
  /** The input as JSON Schema, when the command has one. */
  input?: unknown
}

export interface ViewConfigEntry {
  key: string
  owner: string
  value: unknown
  option: ConfigOption
}

/** Everything a UI can show about a session. */
export interface SessionViewState {
  threadId: string
  status: 'idle' | 'running' | 'requires_action'
  connection: 'open' | 'reconnecting' | 'closed'
  messages: Array<ViewMessage>
  approvals: Array<Approval>
  questions: Array<ViewQuestion>
  signIns: Array<SignIn>
  /** Background agents that run now. */
  agents: Array<{ id: string; name: string }>
  queuedTurns: number
  commands: Array<ViewCommand>
  config: Array<ViewConfigEntry>
  tools: Array<{ name: string; owner: string }>
  /** Each plugin's saved state, by plugin name. */
  plugins: Record<string, unknown>
}
