import type { InferSchemaType, ModelMessage, SchemaInput } from '@tanstack/ai'
import type { SessionIndexEntry } from '@tanstack/ai-persistence'
import type { CredentialsAccess } from './auth'
import type { SessionSnapshot } from './session'
import type { ChatTurnResult, Operation, Principal, Receipt } from './types'

/** A question a command asks the user. The host renders it from the schema. */
export interface Question<TSchema extends SchemaInput | undefined = undefined> {
  message: string
  /** The answer's shape. Without one, the answer is any text. */
  schema?: TSchema
  /**
   * The answer is a secret, for example an API key or a password. Hosts hide
   * it while the user types, and the session does not keep it in the inbox.
   */
  secret?: boolean
}

export type AnswerOf<TSchema> = TSchema extends SchemaInput
  ? InferSchemaType<TSchema>
  : string

/** The parts of the session a plugin can use. */
export interface PluginSessionApi {
  threadId: string
  /**
   * Who sent the input of the running chat turn. Outside a turn: the
   * principal that opened the session. In a command's `run` context: who
   * runs the command. Code that runs after its turn ends (a background
   * agent's tool) gets the sender of the turn that runs at that time.
   */
  principal: Principal | undefined
  snapshot: () => SessionSnapshot
  /**
   * Start a chat turn, as if the user typed `text`. While a turn runs, the new
   * turn waits in the queue. Cancel the returned turn to drop it before it starts.
   */
  prompt: (text: string) => Operation<ChatTurnResult>
  /**
   * Add `text` to the transcript as an assistant note, not as a user prompt.
   * When no turn runs, the note is written at once. Else it is written before
   * the next turn starts. With `wake: true`, a new turn that sends `text` is
   * also queued, so the model can act on the note. Resolves when the note is
   * written or queued and the wake turn is queued, not when that turn ends.
   */
  note: (text: string, options?: { wake?: boolean }) => Promise<void>
  /** The saved transcript. */
  transcript: () => Promise<Array<ModelMessage>>
  /** Replace the saved transcript (for example after a summary). */
  replaceTranscript: (messages: Array<ModelMessage>) => Promise<void>
  /**
   * The session index entry of this thread. `undefined` when the host has
   * no `stores.sessions`, or the thread has no entry.
   */
  entry: () => Promise<SessionIndexEntry | undefined>
  /**
   * Change the session index entry of this thread. Each field you pass
   * replaces the stored one. Resolves to the changed entry. Without
   * `stores.sessions`, or for a thread with no entry, it writes nothing and
   * resolves to `undefined`.
   *
   * @example
   * ```ts
   * await ctx.session.updateEntry({ title: 'Fix the login bug' })
   * ```
   */
  updateEntry: (
    patch: Partial<Pick<SessionIndexEntry, 'title' | 'metadata' | 'usage'>>,
  ) => Promise<SessionIndexEntry | undefined>
  /**
   * Ask the user and wait for the answer. Hosts show it (the CLI prompts,
   * ACP shows an elicitation). Rejects when the session closes.
   */
  ask: <TSchema extends SchemaInput | undefined = undefined>(
    question: Question<TSchema>,
  ) => Promise<AnswerOf<TSchema>>
  /**
   * Tell clients that the user must sign in. Hosts show the link (the CLI
   * opens the browser) or the device code.
   */
  authRequired: (info: {
    connector: string
    url?: string
    userCode?: string
  }) => void
  /** Change a session setting, the same as a client. Applies at the next turn. */
  setConfig: (key: string, value: unknown) => Promise<Receipt>
}

/** What a command handler receives besides its input. */
export interface CommandContext {
  signal: AbortSignal
  /** The session, for the user who runs the command: `session.prompt` runs as that user. */
  session: PluginSessionApi
  /** Who runs the command. Default: the principal that opened the session. */
  principal?: Principal
  /**
   * The credentials of the user who runs the command. Save a sign-in here,
   * so it belongs to that user.
   */
  credentials: CredentialsAccess
}

/** A user action: a slash command, a button, a dashboard action. Not a model tool. */
export interface CommandDefinition<
  TSchema extends SchemaInput | undefined = SchemaInput | undefined,
> {
  description: string
  /** The input shape, checked before `run`. */
  input?: TSchema
  run: (
    input: TSchema extends SchemaInput ? InferSchemaType<TSchema> : undefined,
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
