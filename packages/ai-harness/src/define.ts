import type {
  AgentLoopStrategy,
  AnyChatMiddleware,
  AnyTextAdapter,
  AnyTool,
  InterruptDefinition,
  KeyedAdapter,
  ModelMessage,
  PromptCacheOptions,
  ReasoningOption,
  SubagentRouterPick,
  SubagentsBag,
  SystemPrompt,
} from '@tanstack/ai'
import type { AnyAgent } from './agents'
import type { MediaOptions } from './media'
import type { HarnessPlugin } from './plugins'
import type { HarnessSession } from './session'
import type { HarnessTurnOptions, RecoverHook } from './turn'
import type { BusyPolicy, Principal, ThreadSettings, UserInput } from './types'

/** The `subagents` option: the same as `chat({ subagents })`. */
export type HarnessSubagents<TSubagents extends ReadonlyArray<AnyAgent>> = Omit<
  SubagentsBag<TSubagents>,
  'binding'
>

/**
 * What `routing.router` gets: the fields of the `subagents.router` context,
 * plus the harness fields of the turn.
 */
export interface HarnessRouterContext {
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
  session: HarnessSession
  /**
   * The user input of the turn as sent: text, or content parts. `undefined`
   * for a turn with no new user message.
   */
  input?: UserInput
  /** The id of the turn operation. */
  operationId: string
  /** The id of the turn input, when the turn has one. */
  inputId?: string
  /** Who sent the turn input. Default: the principal that opened the session. */
  principal?: Principal
  /** The `context` of the turn input. Client data: do not trust it. */
  context?: unknown
  /** The main text adapter of the turn, with the user's keys bound. */
  adapter: AnyTextAdapter
}

/**
 * The `routing` option. The other fields mean the same as in `subagents`.
 * `limits` defaults to `subagents.limits`. With `strategy: 'handoff'`, the
 * main model answers after the agents, in the same turn, and it keeps its
 * `subagents`.
 */
export interface HarnessRouting extends Pick<
  SubagentsBag,
  'order' | 'strategy' | 'limits' | 'sandbox'
> {
  /**
   * Pick who answers the turn, with the picks of `subagents.router`:
   * `'main'`, an agent name, a list of names, `{ names, order }`, or
   * `{ steps }`. Give an agent with `inputSchema` its input with
   * `{ name, input }`. A throw fails the turn.
   */
  router: (
    ctx: HarnessRouterContext,
  ) => SubagentRouterPick | Promise<SubagentRouterPick>
}

/**
 * Limits for one input on a durable host (a host with `stores.log`). A host
 * without a log does not read them.
 */
export interface HarnessDurability {
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
   * never ran, and a turn whose lease expired. The context has the decision
   * the harness takes by default. Return `undefined` to keep it.
   */
  recover?: RecoverHook
}

/**
 * What `defineHarness` takes. Where it overlaps with `chat()`, the option
 * names and types are the same.
 */
export interface HarnessConfig<
  TAdapter extends AnyTextAdapter = AnyTextAdapter,
  TAgents extends ReadonlyArray<AnyAgent> = ReadonlyArray<AnyAgent>,
  TSubagents extends ReadonlyArray<AnyAgent> = ReadonlyArray<AnyAgent>,
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
   * Models a thread can pick by name with `session.configure({ model })`.
   * The stored name picks the model of each turn, after `overrides.adapter`
   * and before a plugin `adapter()`.
   */
  models?: Record<string, AnyTextAdapter | KeyedAdapter<AnyTextAdapter>>
  systemPrompts?: Array<SystemPrompt>
  tools?: ReadonlyArray<AnyTool>
  middleware?: ReadonlyArray<AnyChatMiddleware>
  /** When a turn stops calling the model. Defaults to `maxIterations(50)`. */
  agentLoopStrategy?: AgentLoopStrategy
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
  routing?: HarnessRouting
  /** Called once per session, so every session gets fresh plugin instances. */
  plugins?: () => ReadonlyArray<HarnessPlugin>
  /** What a `prompt` does while a chat turn runs. Default `'queue'`. */
  busy?: BusyPolicy
  /** Attempt and time limits for each input on a durable host. */
  durability?: HarnessDurability
  /** Hooks that control a chat turn: retries, joins, and the end of a turn. */
  turn?: HarnessTurnOptions
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
     * that calls `session.configure()` can change every field. `plugins` and
     * `instructions` let a client turn off a plugin and write into the
     * system prompt, so expose them only to clients you trust.
     */
    settings?: ReadonlyArray<keyof ThreadSettings>
  }
}

const HARNESS_KIND = 'tanstack-ai-harness' as const

/** An immutable harness definition. Importing it starts nothing. */
export type HarnessDefinition<
  TAdapter extends AnyTextAdapter = AnyTextAdapter,
  TAgents extends ReadonlyArray<AnyAgent> = ReadonlyArray<AnyAgent>,
  TSubagents extends ReadonlyArray<AnyAgent> = ReadonlyArray<AnyAgent>,
> = Readonly<HarnessConfig<TAdapter, TAgents, TSubagents>> & {
  readonly kind: typeof HARNESS_KIND
  readonly version: 1
}

/** A harness definition with any type parameters. */
export type AnyHarness = HarnessDefinition<any, any, any>

/** Every agent a harness registers, as a union. */
export type HarnessAgentsOf<THarness> =
  THarness extends HarnessDefinition<any, infer TAgents, infer TSubagents>
    ? TAgents[number] | TSubagents[number]
    : never

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
>(
  config: HarnessConfig<TAdapter, TAgents, TSubagents>,
): HarnessDefinition<TAdapter, TAgents, TSubagents> {
  if (config.name.trim() === '') {
    throw new Error('defineHarness requires a non-empty name')
  }
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
  return Object.freeze({ ...config, kind: HARNESS_KIND, version: 1 as const })
}
