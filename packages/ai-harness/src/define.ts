import type {
  AgentLoopStrategy,
  AnyChatMiddleware,
  AnyTextAdapter,
  AnyTool,
  InterruptDefinition,
  SubagentsBag,
  SystemPrompt,
} from '@tanstack/ai'
import type { AnyAgent } from './agents'
import type { HarnessPlugin } from './plugins'
import type { BusyPolicy } from './types'

/** The `subagents` option: the same as `chat({ subagents })`. */
export type HarnessSubagents<TSubagents extends ReadonlyArray<AnyAgent>> = Omit<
  SubagentsBag<TSubagents>,
  'binding'
>

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
  /** The main agent-loop model, the same as `chat({ adapter })`. */
  adapter: TAdapter
  systemPrompts?: Array<SystemPrompt>
  tools?: ReadonlyArray<AnyTool>
  middleware?: ReadonlyArray<AnyChatMiddleware>
  /** When a turn stops calling the model. Defaults to `maxIterations(50)`. */
  agentLoopStrategy?: AgentLoopStrategy
  modelOptions?: TAdapter['~types']['providerOptions']
  interrupts?: ReadonlyArray<InterruptDefinition<any, any, any, any>>
  /** Runtime context passed to middleware hooks and server tools. */
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
  /** Called once per session, so every session gets fresh plugin instances. */
  plugins?: () => ReadonlyArray<HarnessPlugin>
  /** What a `prompt` does while a chat turn runs. Default `'queue'`. */
  busy?: BusyPolicy
  /** What clients may call. Nothing is exposed by default. */
  expose?: {
    agents?: ReadonlyArray<TAgents[number]['name'] | TSubagents[number]['name']>
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
 * names as `chat()`, plus `agents`, `plugins`, `busy`, and `expose`.
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
  TAdapter extends AnyTextAdapter,
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
