import type {
  AgentProduces,
  DefinedAgent,
  InferSchemaType,
  SchemaInput,
  StreamChunk,
  SubagentRunContext,
} from '@tanstack/ai'
import { askWithoutSession, stepRunWithoutSession } from './durable-tool'
import { waitUntil } from './utils'
import type { ToolStep } from './durable-tool'
import type { HandoffOptions } from './handoff'
import type {
  AgentRunOptions,
  AgentStartOptions,
  RunArgs,
} from './session/types'
import type { AgentRun, RunContext } from './types'
import type { PluginState } from './plugins'
import type { AnyHarness } from './define'

/** Any agent made with `defineAgent`, with its types kept. */
export type AnyAgent = DefinedAgent<any, any, any, any, any, any, any>

/** The input an agent takes: its `inputSchema` type, or `undefined`. */
export type AgentInputOf<TAgent> = TAgent extends {
  inputSchema?: infer TSchema
}
  ? TSchema extends SchemaInput
    ? InferSchemaType<TSchema>
    : undefined
  : undefined

/**
 * What running an agent resolves to:
 * - its `outputSchema` type, when it has one;
 * - else the value its promise `run` resolves to;
 * - else the child's text.
 */
export type AgentResultOf<TAgent> =
  TAgent extends DefinedAgent<
    any,
    any,
    infer TSchema,
    any,
    any,
    infer TResult,
    any
  >
    ? TSchema extends SchemaInput
      ? InferSchemaType<TSchema>
      : unknown extends TResult
        ? string
        : TResult
    : unknown

/** A read-only view of the agents a session can run. */
export interface AgentRegistryView {
  /** Every agent, in registration order. */
  list: () => ReadonlyArray<AnyAgent>
  /** The agent named `name`, or `undefined`. */
  get: (name: string) => AnyAgent | undefined
  /** The first agent whose `produces` matches, or `undefined`. */
  find: (query: { produces: AgentProduces }) => AnyAgent | undefined
}

/**
 * The agents of one session, with the owner of each (the harness, or a
 * plugin name). Adding a name twice with two different agents is an error that
 * names both owners. Adding the same agent object twice is allowed, so an
 * agent can sit in both `agents` and `subagents.agents`.
 */
export class AgentRegistry implements AgentRegistryView {
  private readonly agents = new Map<
    string,
    { agent: AnyAgent; owner: string }
  >()

  add(agent: AnyAgent, owner: string): void {
    const existing = this.agents.get(agent.name)
    if (existing && existing.agent !== agent) {
      throw new Error(
        `Duplicate agent "${agent.name}": first owner ${existing.owner}, second owner ${owner}.`,
      )
    }
    if (!existing) this.agents.set(agent.name, { agent, owner })
  }

  /** Add `owner`'s agent, or replace it. A name another owner has throws. */
  set(agent: AnyAgent, owner: string): void {
    const existing = this.agents.get(agent.name)
    if (existing && existing.owner !== owner) {
      throw new Error(
        `Agent "${agent.name}" belongs to ${existing.owner}. ${owner} cannot replace it.`,
      )
    }
    this.agents.set(agent.name, { agent, owner })
  }

  /** Remove `owner`'s agent `name`. Another owner's name does nothing. */
  delete(name: string, owner: string): void {
    if (this.agents.get(name)?.owner === owner) this.agents.delete(name)
  }

  /** Remove every agent that the harness itself did not add. */
  deletePluginAgents(): void {
    for (const [name, entry] of this.agents) {
      if (entry.owner !== 'the harness') this.agents.delete(name)
    }
  }

  list(): ReadonlyArray<AnyAgent> {
    return [...this.agents.values()].map((entry) => entry.agent)
  }

  get(name: string): AnyAgent | undefined {
    return this.agents.get(name)?.agent
  }

  /** Who added the agent `name`: `'the harness'` or a plugin name. */
  ownerOf(name: string): string | undefined {
    return this.agents.get(name)?.owner
  }

  find(query: { produces: AgentProduces }): AnyAgent | undefined {
    return this.list().find((agent) => agent.produces === query.produces)
  }

  /** A copy for one chat turn, so turn plugins can add agents for that turn only. */
  fork(): AgentRegistry {
    const copy = new AgentRegistry()
    for (const [name, entry] of this.agents) copy.agents.set(name, entry)
    return copy
  }
}

/**
 * Start one agent: a definition, typed from its schemas, or a name the
 * session knows, untyped.
 */
export interface AgentCall<TOptions> {
  <TAgent extends AnyAgent>(
    agent: TAgent,
    ...args: RunArgs<TAgent, TOptions>
  ): AgentRun<AgentResultOf<TAgent>>
  (agent: string, input?: unknown, options?: TOptions): AgentRun<unknown>
}

/** How a group of agents runs. */
export interface AgentGroupOptions {
  /** How many children run at the same time. Default: all of them. */
  concurrency?: number
  /**
   * `'cancel-siblings'` (default): the first failure cancels the other
   * children, and `group` rejects with that error. `'collect'`: every child
   * runs to its end, and `group` resolves to one entry per child.
   */
  onFailure?: 'cancel-siblings' | 'collect'
  /**
   * The durable name of the group in the run that starts it. Default: the
   * order of the `group` calls in that run.
   */
  key?: string
}

/** One child of a `group` with `onFailure: 'collect'`. */
export type AgentSettled<TResult> =
  | { ok: true; value: TResult }
  | { ok: false; error: unknown }

/** The children of one `group` call. */
export interface AgentGroup {
  /** Start a child of the group. Its run is like the run of `start`. */
  start: AgentCall<AgentStartOptions>
}

/**
 * Start agents and run them: `start` in the background, `run` and `group` to
 * get the results. `ctx.harness.agents` in agent code and `ctx.agents` in a
 * plugin have this shape.
 */
export interface AgentActions {
  /**
   * Start `agent` (a definition, or a name the session knows) in the
   * background, and return its run at once. In agent code, the child counts
   * against the subagent tree budget of the run that starts it. Over the
   * budget, `start` throws and nothing starts.
   */
  start: AgentCall<AgentStartOptions>
  /**
   * `start` without a wake turn. Await the run to get the result. The run
   * can still be cancelled and get messages.
   */
  run: AgentCall<AgentRunOptions>
  /**
   * Run children together. `body` starts them with `g.start` and returns
   * their runs. `group` resolves to their results, in the same order. Every
   * child that `body` started settles before `group` returns.
   */
  group: {
    <const TRuns extends ReadonlyArray<AgentRun<unknown>>>(
      options: AgentGroupOptions & { onFailure: 'collect' },
      body: (g: AgentGroup) => TRuns | Promise<TRuns>,
    ): Promise<{
      -readonly [K in keyof TRuns]: AgentSettled<Awaited<TRuns[K]>>
    }>
    <const TRuns extends ReadonlyArray<AgentRun<unknown>>>(
      options: AgentGroupOptions & { onFailure?: 'cancel-siblings' },
      body: (g: AgentGroup) => TRuns | Promise<TRuns>,
    ): Promise<{ -readonly [K in keyof TRuns]: Awaited<TRuns[K]> }>
  }
}

/** What a harness session adds to an agent run that it starts from code. */
export interface HarnessAgentContext {
  /**
   * The steps of the run. In a run started with `runAgainAfterCrash: true`, a
   * finished step returns its stored value when the run
   * runs again, and `fn` does not run again. Else `fn` runs each time,
   * and `sleep` waits its full time.
   */
  step: ToolStep
  /** Start and run agents, as children of this run. */
  agents: AgentActions
  /**
   * Hand the turn to another root agent, or to `'main'` (the main model).
   * The target answers next, in this turn, and the later turns go to it.
   * `{ human: true }` hands it to a person, when `routing.allowHandoffToHuman` is true:
   * the turn ends `interrupted`, and the session pauses until an operator
   * answers the `human` wait.
   * It works in a root agent that answers a turn of a harness with
   * `routing`. Anywhere else it throws. It throws for a target that is not a
   * root agent too.
   *
   * @example
   * ```ts
   * await ctx.harness.handoff({ to: 'billing', note: 'Refund for order 42' })
   * ```
   */
  handoff: (options: HandoffOptions) => Promise<void>
  /**
   * State that the agents of one session share, by `key`. The session log
   * keeps it, so it survives a restart, and a fork of the thread has it.
   * Before the first update, `get` gives `initial`. The value is JSON.
   *
   * @example
   * ```ts
   * const seen = ctx.harness.state({ key: 'seen', initial: [] as Array<string> })
   * await seen.update((list) => [...list, 'docs.md'])
   * ```
   */
  state: <T>(options: { key: string; initial: T }) => PluginState<T>
}

const noSessionState = () => {
  throw new Error(
    'ctx.harness.state needs a run that a harness session started.',
  )
}

const noSessionAgents = () => {
  throw new Error(
    'ctx.harness.agents needs a run that a harness session started.',
  )
}

const noTurnHandoff = () =>
  Promise.reject(
    new Error(
      'ctx.harness.handoff needs a root agent that answers a turn of a harness with routing.',
    ),
  )

/**
 * The parts of `ctx.harness` that a tool-mode child of a chat turn gets in
 * place of a durable session context: `step.do`
 * runs `fn` each time, `step.sleep` waits its full time, `step.ask`
 * throws, and each call of `agents`, `state`, and `handoff` throws.
 */
export const NO_SESSION_CONTEXT: HarnessAgentContext = {
  // `fn` runs each time, so it needs no JSON copy.
  step: {
    do: async (name, fn) => fn(stepRunWithoutSession(name)),
    sleep: ({ ms }) => waitUntil(Date.now() + ms),
    ask: askWithoutSession,
  },
  agents: {
    start: noSessionAgents,
    run: noSessionAgents,
    group: noSessionAgents,
  },
  handoff: noTurnHandoff,
  state: noSessionState,
}

/**
 * Run `harness` as a child session of the run that owns a `ctx.harness`, and
 * stream its events. See `harnessAgent`.
 */
export type HarnessChildRun = (
  harness: AnyHarness,
  ctx: SubagentRunContext,
) => AsyncIterable<StreamChunk>

/**
 * The child hook of each `ctx.harness` that a session made. Not a field of
 * the context, so agent code cannot call it. `NO_SESSION_CONTEXT` has none.
 */
const childRuns = new WeakMap<HarnessAgentContext, HarnessChildRun>()

/** The run context of the run of each `ctx.harness` that a session made. */
const runContexts = new WeakMap<HarnessAgentContext, RunContext>()

/**
 * @internal Give `context` the child hook `run`, and the run context of the
 * run that it belongs to. Returns `context`.
 */
export function withHarnessChild(
  context: HarnessAgentContext,
  run: HarnessChildRun,
  runContext: RunContext,
): HarnessAgentContext {
  childRuns.set(context, run)
  runContexts.set(context, runContext)
  return context
}

/**
 * @internal The run context of the run of `context`: for an agent that runs
 * as a tool of a turn, the run of that turn. `undefined` outside a run that
 * a harness session started.
 */
export function runContextOf(context: HarnessAgentContext | undefined) {
  return context ? runContexts.get(context) : undefined
}

/**
 * @internal The child hook of `context`, or `undefined` outside a run that
 * a harness session started.
 */
export function harnessChildOf(context: HarnessAgentContext | undefined) {
  return context ? childRuns.get(context) : undefined
}

declare module '@tanstack/ai' {
  /**
   * `ctx.harness` in the `run` of an agent: `step`, `agents`, `state`, and
   * `handoff`. A harness gives it to every agent run in a session, and to
   * the children those runs start through `ctx.chat({ subagents })`. A run
   * that a plain `chat()` starts has no `ctx.harness`, so check it before
   * you use it. `handoff` works only in a root agent that answers a turn of
   * a harness with `routing`.
   *
   * @example
   * ```ts
   * if (!ctx.harness) throw new Error('This agent must run in a harness.')
   * const total = await ctx.harness.step.do('sum', () => 1 + 2)
   * ```
   */
  interface SubagentContextExtension {
    harness?: HarnessAgentContext
  }
}
