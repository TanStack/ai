import type { InferSchemaType, ModelMessage, SchemaInput } from '@tanstack/ai'
import type { LogRecord, SessionIndexEntry } from '@tanstack/ai-persistence'
import type { CredentialsAccess } from './auth'
import type { ToolStep } from './durable-tool'
import type { SessionSnapshot } from './session/index'
import type { SessionEntryChange, SessionEntryUpdate } from './session-entry'
import type {
  ChatTurnResult,
  Operation,
  HarnessUser,
  Receipt,
  RunContext,
  ThreadSettings,
} from './types'

/** A question a command asks the user. The host renders it from the schema. */
export interface Question<TSchema extends SchemaInput | undefined = undefined> {
  message: string
  /** The answer's shape. Without one, the answer is any text. */
  schema?: TSchema
  /**
   * The answer is a secret, for example an API key or a password. Hosts hide
   * it while the user types, and the session does not keep it in the log.
   */
  secret?: boolean
  /**
   * A page the user must open before they answer, for example a sign-in or a
   * verify page. Hosts show the link. The session does not open it.
   */
  url?: string
  /**
   * When the question expires with no answer, in epoch milliseconds. Then
   * the wait ends `expired`, and `ask` rejects. Default: no limit.
   */
  expiresAt?: number
  /**
   * Stop the wait. The wait ends `cancelled`, and `ask` rejects with the
   * reason of the signal.
   */
  signal?: AbortSignal
  /**
   * A live wait of a tool call, by its name: the harness keeps the answer
   * in the memory of this host, so the host keeps the session while it
   * waits. Only an MCP elicitation (`'mcp-elicitation'`) asks this way. The
   * wait belongs to `run`, the run of the tool call: its user may answer,
   * and the wait ends `cancelled` when that run stops.
   */
  live?: { name: 'mcp-elicitation'; run: RunContext }
}

export type AnswerOf<TSchema> = TSchema extends SchemaInput
  ? InferSchemaType<TSchema>
  : string

/**
 * The parts of the session a plugin can use. `TMetadata` is the type of the
 * session index `metadata`, from the `metadataSchema` of the plugin.
 */
export interface PluginSessionApi<TMetadata = Record<string, unknown>> {
  threadId: string
  /**
   * The user this API acts for. In a command: who runs the command. In a
   * turn plugin: the sender of its turn. In a session plugin: the user
   * that opened the session, never the sender of a running turn. For the
   * user of a tool call, read `ctx.context.run.user`.
   */
  user: HarnessUser | undefined
  snapshot: () => SessionSnapshot
  /**
   * Start a chat turn, as if the user typed `text`. While a turn runs, the new
   * turn waits in the queue. Cancel the returned turn to drop it before it starts.
   * The turn runs as `options.user`: pass the user whose work it
   * continues, for example `ctx.context.run.user` of the run that
   * started the work. Default: `user` of this API. It never runs as
   * the sender of another running turn.
   */
  send: (
    text: string,
    options?: { user?: HarnessUser },
  ) => Operation<ChatTurnResult>
  /**
   * Add `text` to the transcript as an assistant note, not as a user prompt.
   * When no turn runs, the note is written at once. Else it is written before
   * the next turn starts. With `wake: true`, a new turn that sends `text` is
   * also queued, so the model can act on the note. Resolves when the note is
   * written or queued and the wake turn is queued, not when that turn ends.
   * The wake turn runs as `options.user`, as `send` does.
   */
  note: (
    text: string,
    options?: { wake?: boolean; user?: HarnessUser },
  ) => Promise<void>
  /** The saved transcript. */
  transcript: () => Promise<Array<ModelMessage>>
  /**
   * The kept records of `type` of this thread, oldest first: the last ones
   * that the `keepRecords` of the plugins name. The log snapshot keeps
   * them, so they stay after the store drops old records.
   *
   * @example
   * ```ts
   * const steps = await ctx.session.keptRecords('acme/steps:step')
   * ```
   */
  keptRecords: (type: string) => Promise<Array<LogRecord>>
  /** Replace the saved transcript (for example after a summary). */
  replaceTranscript: (messages: Array<ModelMessage>) => Promise<void>
  /**
   * The session index entry of this thread. `undefined` when the host has
   * no `stores.sessions`, or the thread has no entry.
   */
  indexEntry: () => Promise<SessionIndexEntry<TMetadata> | undefined>
  /**
   * Change the session index entry of this thread. Each field you pass
   * replaces the stored one. Pass a function of the current entry to change
   * part of a field: it runs again when another host wrote first. The
   * `metadataSchema` of the plugin and of the harness check `metadata`, and
   * a refused value throws `SessionMetadataError`. Resolves to the changed
   * entry. Without `stores.sessions`, or for a thread with no entry, it
   * writes nothing and resolves to `undefined`.
   *
   * @example
   * ```ts
   * await ctx.session.updateIndexEntry({ title: 'Fix the login bug' })
   * ```
   */
  updateIndexEntry: (
    update: SessionEntryUpdate<
      TMetadata,
      Omit<SessionEntryChange<TMetadata>, 'pinned'> &
        Pick<SessionIndexEntry, 'usage'>
    >,
  ) => Promise<SessionIndexEntry<TMetadata> | undefined>
  /**
   * Ask the user in a live wait of a tool call, and wait for the answer:
   * only an MCP elicitation asks this way (see `live`). Hosts show it (the
   * CLI prompts, ACP shows an elicitation). The log keeps the question as a
   * wait of that run, so every host shows it. Rejects when the session
   * closes, when the run stops, when `signal` aborts, and when the question
   * expires.
   *
   * Without `live`, it throws: no process waits for a user. In a command, a
   * durable tool, or an agent run, use `step.ask`. To let the model ask, add
   * the `question` tool. To ask before a tool call, give the tool its
   * resources (`PermissionResources`), and `permissions()` asks before the
   * call runs.
   */
  ask: <TSchema extends SchemaInput | undefined = undefined>(
    question: Question<TSchema>,
  ) => Promise<AnswerOf<TSchema>>
  /**
   * Tell clients that the user must sign in. Hosts show the link (the CLI
   * opens the browser) or the device code.
   *
   * In a command (an OAuth login), it also opens a live `sign-in` wait of
   * the command run. The wait ends `answered` when the command completes,
   * and `cancelled` when it fails. At `expiresAt` (default: 15 minutes), the
   * wait ends `expired`, and the command is cancelled.
   */
  authRequired: (info: {
    connector: string
    url?: string
    userCode?: string
    /** When the sign-in expires, in epoch milliseconds. */
    expiresAt?: number
  }) => void
  /** Change a session setting, the same as a client. Applies at the next turn. */
  setPluginSetting: (change: {
    key: string
    value: unknown
  }) => Promise<Receipt>
  /**
   * The stored settings of the thread (`session.updateThreadSettings`). Read them at
   * each call, for example the working folder `cwd`: a change applies from
   * the next turn.
   */
  threadSettings: () => ThreadSettings
}

/** What a command handler receives besides its input. */
export interface CommandContext {
  signal: AbortSignal
  /** The session, for the user who runs the command: `session.prompt` runs as that user. */
  session: PluginSessionApi
  /** Who runs the command. Default: the user that opened the session. */
  user?: HarnessUser
  /**
   * The credentials of the user who runs the command. Save a sign-in here,
   * so it belongs to that user. The same as `run.credentials`.
   */
  credentials: CredentialsAccess
  /**
   * The run of the command: the user who runs it, and that user's
   * credentials and model provider keys (`run.keys`).
   */
  run: RunContext
  /**
   * The steps of the command. To ask the user, call `step.ask`: the log
   * keeps the question, so a user on any machine can answer it. When the
   * host stops while the command waits, the next host runs the command
   * again from the top: put each side effect before the ask in `step.do`,
   * and it does not run twice.
   *
   * @example
   * ```ts
   * run: async (_input, { step, credentials }) => {
   *   const key = await step.ask({ name: 'key', message: 'Paste your key', secret: true })
   *   await credentials.set({ id: 'acme', credential: { type: 'api_key', value: key } })
   * }
   * ```
   */
  step: ToolStep
}

/** A user action: a slash command, a button, a dashboard action. Not a model tool. */
export interface CommandDefinition<
  TSchema extends SchemaInput | undefined = SchemaInput | undefined,
> {
  description: string
  /**
   * The input shape, checked before `run`. Without one, `run` gets the input
   * as sent, typed `unknown`: narrow it before use.
   */
  input?: TSchema
  run: (
    input: TSchema extends SchemaInput ? InferSchemaType<TSchema> : unknown,
    ctx: CommandContext,
  ) => unknown
}

/** A command with any input type. */
export type AnyCommand = CommandDefinition<any>

/**
 * Define a command with a typed input.
 *
 * @example
 * ```ts
 * const clear = defineCommand({
 *   description: 'Remove every todo',
 *   run: async () => ({ removed: await db.clear() }),
 * })
 * ```
 */
export function defineCommand<
  const TSchema extends SchemaInput | undefined = undefined,
>(command: CommandDefinition<TSchema>): CommandDefinition<TSchema> {
  return command
}
