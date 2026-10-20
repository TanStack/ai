import { assertMetadataSchema } from './session-entry'
import type {
  AgentLoopStrategy,
  AnyChatMiddleware,
  AnyTextAdapter,
  AnyTool,
  InferToolInput,
  InterruptDefinition,
  KeyedAdapter,
  ModelMessage,
  PromptCacheOptions,
  ReasoningOption,
  SchemaInput,
  SubagentRouterPick,
  SubagentsBag,
  SystemPrompt,
} from '@tanstack/ai'
import type { AnyAgent } from './agents'
import type { ProjectOptions, ReduceOptions } from './log'
import type { MediaOptions } from './media'
import type { HarnessPlugin, PluginMetadataCheck, PluginModel } from './plugins'
import type { HarnessSession } from './session/index'
import type { MetadataOf } from './session-entry'
import type { HarnessTurnOptions, RecoverHook } from './turn'
import type {
  BusyPolicy,
  HarnessUser,
  ThreadSettings,
  UserInput,
} from './types'

/**
 * The `subagents` option: the same as `chat({ subagents })`, without
 * `binding` and `keys`. The session binds its own provider keys.
 */
export type HarnessSubagents<TSubagents extends ReadonlyArray<AnyAgent>> = Omit<
  SubagentsBag<TSubagents>,
  'binding' | 'keys'
>

/**
 * What `routing.router` gets: the fields of the `subagents.router` context,
 * plus the harness fields of the turn.
 */
export interface HarnessRouterContext<TMetadataSchema = any> {
  /** The model messages of the turn: the history, then the new user message. */
  messages: Array<ModelMessage>
  /**
   * The root agents of this turn, in registration order: the harness
   * `agents`, then the `agents` of session plugins, then of turn plugins. An
   * agent that is only in `subagents` is not in this list.
   */
  agents: ReadonlyArray<AnyAgent>
  /** Aborted when the turn is cancelled. */
  abortSignal?: AbortSignal
  session: SessionWithMetadata<TMetadataSchema>
  /**
   * The user input of the turn as sent: text, or content parts. `undefined`
   * for a turn with no new user message.
   */
  input?: UserInput
  /** The id of the turn operation. */
  operationId: string
  /** The id of the turn input, when the turn has one. */
  inputId?: string
  /** Who sent the turn input. Default: the user that opened the session. */
  user?: HarnessUser
  /** The `context` of the turn input. Client data: do not trust it. */
  context?: unknown
  /** The main text adapter of the turn, with the user's keys bound. */
  adapter: AnyTextAdapter
  /**
   * Call a model to pick the agent, as `ctx.model.chat` of a plugin does.
   * The call has the keys of the sender and the signal of the turn. Its
   * usage counts in the session (`session.usage().bySource` under
   * `router`) and in the turn. The `run` option is ignored: the call is
   * always for this turn.
   *
   * @example
   * ```ts
   * router: async ({ model, messages }) => {
   *   const { text } = await model.chat({
   *     options: {
   *       messages,
   *       systemPrompts: ['Answer "billing" or "support". Nothing else.'],
   *     },
   *     label: 'pick',
   *   })
   *   return text.trim() === 'billing' ? 'billing' : undefined
   * }
   * ```
   */
  model: PluginModel
  /**
   * The root agent that answers the turns of this thread since the last
   * handoff. `undefined`: the main model answers. Return `undefined` from
   * the router to send the turn to it.
   *
   * The `agents()` plugin has its own primary agent (its `agent` config and
   * `/agent`). That one changes the prompt and tools of the main model. It
   * is not this value, and neither one changes the other.
   */
  activeAgent?: string
}

/**
 * What `routing.router` returns: a pick of `subagents.router`, a handoff, or
 * `undefined`.
 * - `undefined`: the active agent answers, else the main model.
 * - One agent name: that agent answers, and it becomes the active agent.
 * - `'main'`: the main model answers, and no agent is active.
 * - `{ handoff, note }`: a handoff to that root agent (or `'main'`). The log
 *   keeps the note. Then the target answers, and it becomes the active agent.
 * - `{ name, input }`, a list, `{ names }`, or `{ steps }`: those agents
 *   answer. The active agent does not change.
 */
export type HarnessRouterPick =
  | SubagentRouterPick
  | { handoff: string; note?: string }
  | undefined

/**
 * The `routing` option. The other fields mean the same as in `subagents`.
 * `limits` defaults to `subagents.limits`. The `strategy` of `subagents` is
 * not here: use `afterAgentsAnswer`.
 */
export interface HarnessRouting<TMetadataSchema = any> extends Pick<
  SubagentsBag,
  'order' | 'limits' | 'sandbox'
> {
  /**
   * Pick who answers the turn: `undefined` (the active agent), `'main'`, an
   * agent name, a list of names, `{ names, order }`, `{ steps }`, or
   * `{ handoff, note }`. Give an agent with `inputSchema` its input with
   * `{ name, input }`. A throw fails the turn. See {@link HarnessRouterPick}.
   */
  router: (
    ctx: HarnessRouterContext<TMetadataSchema>,
  ) => HarnessRouterPick | Promise<HarnessRouterPick>
  /**
   * What happens after the picked agents answer. `'end-turn'`: the turn
   * ends. `'main-answers'`: the main model answers next, in the same turn,
   * with their answers in the transcript, and it keeps its `subagents`.
   * Default `'end-turn'`.
   */
  afterAgentsAnswer?: 'end-turn' | 'main-answers'
  /**
   * Let the models and your code hand the turn to a person. When true, the
   * `to` of the `handoff` tool also takes `{ human: true }`, and
   * `ctx.harness.handoff({ to: { human: true } })` and `run.handoff` open a
   * `human` wait. When false, the `handoff` tool offers only the agents and
   * `'main'`, and a handoff to a person rejects. Default `false`.
   */
  allowHandoffToHuman?: boolean
  /**
   * Give the main model and each root agent the `handoff` tool. When false,
   * no model gets it, and an app tool can use the name `handoff`. The
   * router and your code (`ctx.harness.handoff`, `run.handoff`) can still
   * hand off. Default `true`.
   */
  giveModelsHandoffTool?: boolean
}

/**
 * Limits for one input, and how the host folds your own log records.
 */
export interface HarnessDurability<
  TMetadataSchema = any,
  TLogState = undefined,
> {
  /**
   * Total attempts for one input, the first run included. Each recovery after
   * a crash is one more attempt. When no attempt is left, the input fails
   * with code `'attempts_exhausted'`. Default 10.
   */
  maxAttempts?: number
  /**
   * Time from the first run of an input until it fails with code
   * `'timeout'`, in milliseconds. Retries do not reset it. Default: no
   * timeout.
   */
  timeoutMs?: number
  /**
   * Decide how an input that a crashed host left recovers: an input that
   * never ran, and a turn whose host stopped. The context has the decision
   * the harness takes by default. Return `undefined` to keep it. Return
   * `{ action: 'run', overrides }` to run the turn with `TurnOverrides`.
   */
  recover?: RecoverHook<TMetadataSchema>
  /**
   * The tool result that recovery gives a `replay: 'never'` tool call that
   * a crash cut: the content and the error of its tool message. Default: a
   * JSON note that the tool may or may not have run.
   */
  interruptedToolResult?: string
  /**
   * The tool result of each tool call of an answer that stopped at the output
   * limit (finish reason `length`): the content and the error of its tool
   * message. The function form gets the call. Such a call never runs, also
   * with `replay: 'safe'`. When set, the answer keeps its calls, each cut
   * call gets this text, and the turn calls the model again. Recovery gives
   * the same text to a cut call with no result in the log. Not set: a cut
   * answer ends the turn, and recovery uses the default. Default: `'The answer was cut off at the output limit before
   * this tool call was complete. The call did not run.'`
   */
  truncatedToolResult?:
    | string
    | ((call: { toolCallId: string; toolName: string }) => string)
  /**
   * Continue an answer that a crash cut. Before the recovered attempt runs,
   * recovery adds the part of the answer that the log has as an assistant
   * message, then one user message for each note, in order, in one append.
   * The model goes on after the notes. The assistant message has the answer
   * text and each signed thinking block (a finished block with its
   * signature, as the transcript keeps thinking), so the provider can replay
   * it. A thinking block with no signature and tool calls are not kept. An
   * attempt that streamed no answer text and no signed thinking (for example
   * only thinking with no signature) runs again with no partial and no note.
   * Signed thinking alone is enough to continue. A string `note` is one
   * note. Default `false`. The default note: `'The previous answer was cut
   * off. Continue exactly where it stopped, without repeating it.'`
   */
  continueCutOff?: boolean | { note?: string | ReadonlyArray<string> }
  /**
   * Run again an agent that the model started with `background: true`, when
   * the host stopped during the run. The next host continues it with the
   * same `subagentRunId`, as a start with `runAgainAfterCrash: true`: the agent code runs
   * again from its start, `ctx.chat` continues from its saved transcript,
   * and `ctx.harness.step` keeps its values. A tool call that finished does
   * not run again. A tool call that ran at the stop runs again. The turn
   * plugins of the turn that started it are gone. `false`: the run fails, as
   * a start without `runAgainAfterCrash`. A child that did not start yet still starts.
   * Default `true`.
   */
  resumeBackgroundAgents?: boolean
  /**
   * The waits of an agent that the main model calls as a tool: an approval,
   * a question, a sign-in, an app interrupt, a client tool, and `step.ask`.
   * `true`: each one is a wait of the turn, in `snapshot().pendingWaits`.
   * After the answer, the agent goes on from where it stopped, and its
   * result goes to the main model. `false`: the agent does not wait. A call
   * that needs an approval gets a tool error, and `step.ask` throws.
   * Default `true`.
   */
  agentToolWaits?: boolean
  /**
   * How a durable host folds your own log records into the model context of
   * each session.
   */
  addRecordsToModelContext?: ProjectOptions
  /**
   * A fold of every host record of the log of a session tree: the root
   * thread and its child threads (agent chains and subagent runs), in log
   * order. Read it with `session.logState()`, or with `view.logState()` of
   * `host.observe`, on any machine.
   */
  logState?: ReduceOptions<TLogState>
}

/**
 * What `defineHarness` takes. Where it overlaps with `chat()`, the option
 * names and types are the same.
 */
export interface HarnessConfig<
  TAdapter extends AnyTextAdapter = AnyTextAdapter,
  TAgents extends ReadonlyArray<AnyAgent> = ReadonlyArray<AnyAgent>,
  TSubagents extends ReadonlyArray<AnyAgent> = ReadonlyArray<AnyAgent>,
  TMetadataSchema = undefined,
  TTools extends ReadonlyArray<AnyTool> = ReadonlyArray<AnyTool>,
  TLogState = undefined,
> {
  /** A stable name, for example `'acme/studio'`. */
  name: string
  /** What the harness does. Shown when another agent can call it. */
  description?: string
  /**
   * The main agent-loop model, the same as `chat({ adapter })`. A
   * `keyedAdapter(...)` is built for each turn with the user's own key: the
   * key saved with `/connect <provider>`, else the provider's env var.
   * Leave it out when a plugin `adapter()` picks the model of every turn. A
   * turn that gets no model from any of them fails.
   */
  adapter?: TAdapter | KeyedAdapter<TAdapter>
  /**
   * Models a thread can pick by name with `session.updateThreadSettings({ model })`.
   * The stored name picks the model of each turn, after `overrides.adapter`
   * and before a plugin `adapter()`.
   */
  models?: Record<string, AnyTextAdapter | KeyedAdapter<AnyTextAdapter>>
  systemPrompts?: Array<SystemPrompt>
  tools?: TTools
  middleware?: ReadonlyArray<AnyChatMiddleware>
  /**
   * When a turn stops calling the model. Defaults to `maxIterations(50)`.
   * Without `durability.truncatedToolResult`, the turn also stops after an
   * answer cut at the output limit.
   */
  agentLoopStrategy?: AgentLoopStrategy
  /**
   * How the server tools of one model call run, the same as
   * `chat({ toolExecution })`. `'parallel'` starts them together.
   * `'sequential'` runs them one at a time, in call order. Default
   * `'parallel'`.
   */
  toolExecution?: 'parallel' | 'sequential'
  modelOptions?: TAdapter['~types']['providerOptions']
  /**
   * Automatic prompt caching for every session, the same as
   * `chat({ promptCache })`. Default `'short'`. `'none'` turns it off. A
   * `key` here is shared by all sessions, so usually leave it out: then each
   * session uses its threadId as the key.
   */
  promptCache?: PromptCacheOptions
  /**
   * How hard the main model thinks on every turn, as the adapter gets it in
   * `TextOptions`. Not set: no reasoning is sent, and the provider default
   * applies. `overrides.reasoning` of a turn replaces it.
   */
  reasoning?: ReasoningOption
  interrupts?: ReadonlyArray<InterruptDefinition<any, any, any, any>>
  /**
   * Runtime context passed to middleware hooks and server tools. When this
   * and the `context` of a turn input are both plain objects, a turn gets
   * both merged, and this value wins for a key in both, so a client cannot
   * replace a server value. Otherwise a turn gets this value when it is set,
   * else the input's.
   */
  context?: unknown
  /**
   * Typed agents the session can run from code, commands, plugins, and
   * exposed clients: `session.agents.<name>.run(input)`.
   */
  agents?: TAgents
  /**
   * Agents the main model can call as tools, the same as `chat({ subagents })`.
   * They are also registered in `session.agents`.
   */
  subagents?: HarnessSubagents<TSubagents>
  /**
   * A router for each new turn. It sends the turn to the main model, or to
   * root agents: the harness `agents` and the `agents` of plugins. A resolve
   * continues the turn it answers, so it does not call the router.
   */
  routing?: HarnessRouting<TMetadataSchema>
  /** Called once per session, so every session gets fresh plugin instances. */
  plugins?: () => ReadonlyArray<
    HarnessPlugin & PluginMetadataCheck<MetadataOf<TMetadataSchema>>
  >
  /**
   * The shape of the `metadata` of the session index entry of each thread,
   * as a Standard Schema (for example a zod object). Each write checks it:
   * `host.sessions.update`, the `update` op of `POST sessions`, and
   * `updateIndexEntry` of plugins and sessions. A write it refuses throws
   * `SessionMetadataError` and writes nothing. It also types the metadata
   * of those writes, of `session.indexEntry()`, of the hooks, and of a client
   * made with `createHarnessClient<typeof harness>`.
   */
  metadataSchema?: TMetadataSchema
  /** What a `prompt` does while a chat turn runs. Default `'queue'`. */
  busy?: BusyPolicy
  /**
   * Attempt and time limits for each input on a durable host, and how that
   * host folds your own log records (`addRecordsToModelContext` and `logState`).
   */
  durability?: HarnessDurability<TMetadataSchema, TLogState>
  /** Hooks that control a chat turn: retries, joins, and the end of a turn. */
  turn?: HarnessTurnOptions<TMetadataSchema>
  /**
   * Files sent to a turn, and media agents make: the size limit, the kinds a
   * user can send, the kinds the model reads, and an optional transcriber for
   * audio the model cannot read.
   */
  media?: MediaOptions
  /** What clients may call. Nothing is exposed by default. */
  expose?: {
    agents?: ReadonlyArray<TAgents[number]['name'] | TSubagents[number]['name']>
    /**
     * The thread settings a client may change with a `configure` input. An
     * input with any other field is refused with `not_exposed`. Server code
     * that calls `session.updateThreadSettings()` can change every field. `plugins` and
     * `instructions` let a client turn off a plugin and write into the
     * system prompt, so expose them only to clients you trust.
     */
    settings?: ReadonlyArray<keyof ThreadSettings>
    /**
     * The plugin config keys a client may set with a `config` input, for
     * example `client.setPluginSetting({ key: 'model', value: 'fast' })`. An input with any other
     * key is refused with `not_exposed`. Server code that calls
     * `session.setPluginSetting()` can set every key. Warning: `mode` of
     * `permissions()` lets a client turn approvals off with `bypass`. Keep
     * `mode` on the server, or expose it only to clients you trust.
     */
    config?: ReadonlyArray<string>
    /**
     * The commands a client may run with a `command` input, for example
     * `client.runCommand({ name: 'undo' })`, or `/undo` in a session view on a
     * client. An input with any other command is refused with `not_exposed`.
     * Server code that calls `session.runCommand()` can run every command. Warning:
     * `/mode bypass` of `permissions()` turns approvals off, so expose `mode`
     * only to clients you trust. Plugins add their commands when a session
     * opens, so `defineHarness` does not check these names.
     */
    commands?: ReadonlyArray<string>
    /**
     * The harness `tools` a client may run with a `tool` input, with no model
     * turn, for example from a schedule or a webhook. An input for any other
     * tool is refused with `not_exposed`. The call goes through the same
     * middleware, input check, and `permissions()` rules as a model call.
     */
    tools?: ReadonlyArray<TTools[number]['name']>
    /**
     * The host record types a client may add with an `append` input, for
     * example a webhook that adds `{ type: 'app.signal', text }`. An input
     * with any other type, or with a `thread` field, is refused with
     * `not_exposed`. Server code that calls `session.appendRecords()` can add every
     * type. The log keeps the records, and `durability.addRecordsToModelContext` decides
     * what the model sees of them.
     */
    records?: ReadonlyArray<string>
  }
}

const HARNESS_KIND = 'tanstack-ai-harness' as const

/** An immutable harness definition. Importing it starts nothing. */
export type HarnessDefinition<
  TAdapter extends AnyTextAdapter = AnyTextAdapter,
  TAgents extends ReadonlyArray<AnyAgent> = ReadonlyArray<AnyAgent>,
  TSubagents extends ReadonlyArray<AnyAgent> = ReadonlyArray<AnyAgent>,
  TMetadataSchema = undefined,
  TTools extends ReadonlyArray<AnyTool> = ReadonlyArray<AnyTool>,
  TLogState = undefined,
> = Readonly<
  HarnessConfig<
    TAdapter,
    TAgents,
    TSubagents,
    TMetadataSchema,
    TTools,
    TLogState
  >
> & {
  readonly kind: typeof HARNESS_KIND
  readonly version: 1
}

/** A harness definition with any type parameters. */
export type AnyHarness = HarnessDefinition<
  any,
  any,
  any,
  any,
  ReadonlyArray<AnyTool>,
  any
>

/** A session whose harness has the metadata schema `TMetadataSchema`. */
export type SessionWithMetadata<TMetadataSchema> = HarnessSession<
  HarnessDefinition<any, any, any, TMetadataSchema, ReadonlyArray<AnyTool>, any>
>

// `durability.logState` makes the log state type invariant, so each pattern
// below takes any log state (the last `any`).

/** The type of the session index `metadata` of a harness. */
export type SessionMetadataOf<THarness> =
  THarness extends HarnessDefinition<
    any,
    any,
    any,
    infer TMetadataSchema,
    ReadonlyArray<AnyTool>,
    any
  >
    ? MetadataOf<TMetadataSchema>
    : Record<string, unknown>

/** Every agent a harness registers, as a union. */
export type HarnessAgentsOf<THarness> =
  THarness extends HarnessDefinition<
    any,
    infer TAgents,
    infer TSubagents,
    any,
    ReadonlyArray<AnyTool>,
    any
  >
    ? TAgents[number] | TSubagents[number]
    : never

/** The `tools` of a harness, as a union. */
export type HarnessToolsOf<THarness> =
  THarness extends HarnessDefinition<any, any, any, any, infer TTools, any>
    ? TTools[number]
    : never

/**
 * The state of the `durability.logState` fold of a harness, as
 * `session.logState()` returns it. `undefined` for a harness without `durability.logState`.
 */
export type HarnessLogStateOf<THarness> = THarness extends {
  durability?: { logState?: ReduceOptions<infer TLogState> }
}
  ? TLogState
  : undefined

/**
 * The input of the harness tool `TName`, from its input schema. `unknown`
 * for a tool that is not in `tools`, for example a plugin tool.
 */
export type HarnessToolInput<THarness, TName> = [
  Extract<HarnessToolsOf<THarness>, { name: TName }>,
] extends [never]
  ? unknown
  : InferToolInput<Extract<HarnessToolsOf<THarness>, { name: TName }>>

/** True for a value made with `defineHarness`. */
export function isHarnessDefinition(value: unknown): value is AnyHarness {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === HARNESS_KIND &&
    (value as { version?: unknown }).version === 1
  )
}

/**
 * Define a harness: a reusable, typed agent configuration. Use the same option
 * names as `chat()`, plus `agents`, `plugins`, `busy`, `expose`, and `media`.
 *
 * @example
 * ```ts
 * const studio = defineHarness({
 *   name: 'acme/studio',
 *   adapter: anthropicText('claude-sonnet-4-5'),
 *   agents: [heroImage],
 *   subagents: { agents: [researcher] },
 * })
 * ```
 */
export function defineHarness<
  TAdapter extends AnyTextAdapter = AnyTextAdapter,
  const TAgents extends ReadonlyArray<AnyAgent> = readonly [],
  const TSubagents extends ReadonlyArray<AnyAgent> = readonly [],
  TMetadataSchema extends SchemaInput | undefined = undefined,
  const TTools extends ReadonlyArray<AnyTool> = readonly [],
  TLogState = undefined,
>(
  config: HarnessConfig<
    TAdapter,
    TAgents,
    TSubagents,
    TMetadataSchema,
    TTools,
    TLogState
  >,
): HarnessDefinition<
  TAdapter,
  TAgents,
  TSubagents,
  TMetadataSchema,
  TTools,
  TLogState
> {
  if (config.name.trim() === '') {
    throw new Error('defineHarness requires a non-empty name')
  }
  assertMetadataSchema(`defineHarness "${config.name}"`, config.metadataSchema)
  const byName = new Map<string, AnyAgent>()
  for (const agent of [
    ...(config.agents ?? []),
    ...(config.subagents?.agents ?? []),
  ]) {
    const existing = byName.get(agent.name)
    if (existing && existing !== agent) {
      throw new Error(
        `defineHarness "${config.name}": two different agents are named "${agent.name}".`,
      )
    }
    byName.set(agent.name, agent)
  }
  for (const name of config.expose?.agents ?? []) {
    if (!byName.has(name)) {
      throw new Error(
        `defineHarness "${config.name}": expose.agents names "${name}", which is not a registered agent.`,
      )
    }
  }
  const toolNames = new Set((config.tools ?? []).map((tool) => tool.name))
  for (const name of config.expose?.tools ?? []) {
    if (!toolNames.has(name)) {
      throw new Error(
        `defineHarness "${config.name}": expose.tools names "${name}", which is not in tools.`,
      )
    }
  }
  for (const type of config.expose?.records ?? []) {
    if (type.startsWith('harness.')) {
      throw new Error(
        `defineHarness "${config.name}": expose.records names "${type}", but the harness owns the record types that start with "harness.".`,
      )
    }
  }
  return Object.freeze({ ...config, kind: HARNESS_KIND, version: 1 as const })
}
