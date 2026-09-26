import type { InferSchemaType, ModelMessage, SchemaInput } from '@tanstack/ai'
import type { SessionSnapshot } from './session'
import type { Principal, Receipt } from './types'

/** A question a command asks the user. The host renders it from the schema. */
export interface Question<TSchema extends SchemaInput | undefined = undefined> {
  message: string
  /** The answer's shape. Without one, the answer is any text. */
  schema?: TSchema
}

export type AnswerOf<TSchema> = TSchema extends SchemaInput
  ? InferSchemaType<TSchema>
  : string

/** The parts of the session a plugin can use. */
export interface PluginSessionApi {
  threadId: string
  principal: Principal | undefined
  snapshot: () => SessionSnapshot
  /** Start a chat turn, as if the user typed `text`. */
  prompt: (text: string) => void
  /** The saved transcript. */
  transcript: () => Promise<Array<ModelMessage>>
  /** Replace the saved transcript (for example after a summary). */
  replaceTranscript: (messages: Array<ModelMessage>) => Promise<void>
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
  session: PluginSessionApi
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
