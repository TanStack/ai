import type { ConfigOption } from '../config'
import type { SessionUsage } from '../usage'
import type { Wait } from '../waits'
import type {
  MediaKind,
  Receipt,
  ThreadSettings,
  UserInput,
  WaitingInput,
} from '../types'

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
  /** The typed result of the agent, when it gave one. */
  result?: unknown
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
  | {
      id: string
      role: 'assistant'
      parts: Array<ViewPart>
      /**
       * The root agent that wrote the message, in a harness with `routing`.
       * `undefined` for the main model.
       */
      agent?: string
    }
  | { id: string; role: 'notice'; kind: NoticeKind; text: string }

/** What an approval sends with a yes: changed arguments, or data for the tool. */
export interface ApproveOptions {
  /** The arguments the tool runs with, in place of the model's. */
  editedArgs?: unknown
  payload?: unknown
}

/**
 * A tool call that waits for a yes or no: a wait of kind `approval`. Its
 * actions answer through `resolve`.
 */
export interface Approval {
  id: string
  toolCallId?: string
  tool: string
  args: unknown
  message?: string
  approve: (options?: ApproveOptions) => void
  /** Say no. `payload` goes to the tool's approval schema, when it has one. */
  reject: (options?: { payload?: unknown }) => void
}

/**
 * An interrupt that waits for an answer of its own shape: a wait of kind
 * `question` (a `question` tool call) or `human`. The run waits for it.
 * `resolve` and `cancel` answer through `resolve`. For a `human` wait that
 * no turn holds, `resolve` sends the answer through `answer`.
 */
export interface ViewInterrupt {
  id: string
  reason: string
  message?: string
  toolCallId?: string
  /** The child agent that stopped, when a child did. */
  subagentRunId?: string
  /** The answer's JSON Schema, when the interrupt has one. */
  responseSchema?: unknown
  /** The data the interrupt sent for the UI, when it has some. */
  payload?: unknown
  /** Send the answer. */
  resolve: (value: unknown) => void
  /** Answer with no value. The turn continues without one. */
  cancel: () => void
}

/**
 * A client tool call: a tool with no server implementation. The UI runs the
 * tool and sends its output through `resolve`. The run waits for it.
 */
export interface ClientToolCall {
  id: string
  toolCallId?: string
  tool: string
  args: unknown
  /** Send the tool's output. */
  resolve: (output: unknown) => void
  /** Send a failure. The model sees that the tool failed with `message`. */
  fail: (message: string) => void
}

/**
 * A question of `step.ask` in a command, a durable tool, or an agent run,
 * or of an MCP server. `answer` sends the answer through `answer`.
 */
export interface ViewQuestion {
  id: string
  message: string
  /** The answer's JSON Schema, when the question has one. */
  schema?: unknown
  /** The answer is a secret (a key or a password). Do not show what the user types. */
  secret?: boolean
  /** A page the user must open before they answer. Show the link. */
  url?: string
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

/** A background agent that runs now. */
export interface ViewAgent {
  id: string
  name: string
  /**
   * `waiting`: the run stopped for a wait (see `waits`), and an answer
   * resumes it.
   */
  status: 'running' | 'waiting'
  /**
   * Send a message to this run. `mode` is `'steer'` (default) or
   * `'followUp'`, as in `AgentRun.send`. Rejects when the view's source
   * cannot send messages to agents.
   */
  send: (
    message: UserInput,
    options?: { mode?: 'steer' | 'followUp' },
  ) => Promise<Receipt>
  /** Stop this run, and the runs it started. */
  cancel: () => Promise<Receipt>
}

/**
 * Everything a UI can show about a session.
 *
 * @experimental The fields can change in a minor release.
 */
export interface SessionViewState {
  threadId: string
  status: 'idle' | 'running' | 'requires_action'
  connection: 'open' | 'reconnecting' | 'closed'
  messages: Array<ViewMessage>
  approvals: Array<Approval>
  /** Client tool calls that wait for their output from the UI. */
  clientTools: Array<ClientToolCall>
  /** Other interrupts that wait for an answer. */
  interrupts: Array<ViewInterrupt>
  questions: Array<ViewQuestion>
  signIns: Array<SignIn>
  /**
   * Every open wait, as `snapshot().pendingWaits` lists it: the waits of
   * the last turn, the questions, and the waits of background agent runs.
   * Read the kind with `waitKind`. Answer each one through its item in
   * `approvals`, `clientTools`, `interrupts`, or `questions`.
   */
  waits: Array<Wait>
  /** Background agents that run now. */
  agents: Array<ViewAgent>
  queuedTurns: number
  /** The inputs that wait, in the order they run. */
  waitingInputs: Array<WaitingInput>
  commands: Array<ViewCommand>
  config: Array<ViewConfigEntry>
  tools: Array<{ name: string; owner: string }>
  /** The names of `defineHarness({ models })`, for a model menu. */
  models: Array<string>
  /** The stored settings of the thread, from `updateThreadSettings`. */
  settings?: ThreadSettings
  /** The token usage of the thread. */
  usage?: SessionUsage
  /** Each plugin's saved state, by plugin name. */
  plugins: Record<string, unknown>
}
