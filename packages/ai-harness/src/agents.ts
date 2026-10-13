import type {
  AgentProduces,
  DefinedAgent,
  InferSchemaType,
  SchemaInput,
} from '@tanstack/ai'
import type { ToolStep } from './durable-tool'
import type { AgentStartOptions } from './session/index'
import type { AgentRun } from './types'

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

/** `harnessContext(ctx).agents`: start agents in the background. */
export interface AgentStarter {
  /**
   * Start `agent` (a definition, or a name the session knows) in the
   * background, and return its run at once. The child counts against the
   * subagent tree budget of the run that starts it. Over the budget, `start`
   * throws and nothing starts.
   */
  start: (
    agent: AnyAgent | string,
    input?: unknown,
    options?: AgentStartOptions,
  ) => AgentRun<unknown>
}

/** What a harness session adds to an agent run that it starts from code. */
export interface HarnessAgentContext {
  /**
   * The steps of the run. On a durable host, in a run started with
   * `resume: true`, a finished step returns its stored value when the run
   * runs again, and `fn` does not run again. Else `fn` runs each time.
   */
  step: ToolStep
  /** Start agents in the background, as children of this run. */
  agents: AgentStarter
}

const NO_SESSION: HarnessAgentContext = {
  step: { do: async (_name, fn) => fn() },
  agents: {
    start: () => {
      throw new Error(
        'harnessContext(ctx).agents needs a run that a harness session started.',
      )
    },
  },
}

const contexts = new WeakMap<object, HarnessAgentContext>()

/**
 * Read `step` and `agents` in the `run` of an agent: `harnessContext(ctx)`.
 * A harness session gives them to each agent run it starts from code (a
 * session agent, `harnessContext(ctx).agents.start`, a background child).
 * In a tool-mode child or outside a harness, `step.do` runs `fn` each time
 * and `agents.start` throws. Pass the `ctx` that `run` gets, not a copy.
 */
export function harnessContext(ctx: object): HarnessAgentContext {
  return contexts.get(ctx) ?? NO_SESSION
}

/** `agent`, with `extras` as its {@link harnessContext} in every run. */
export function withHarnessContext(
  agent: AnyAgent,
  extras: Partial<HarnessAgentContext>,
): AnyAgent {
  return {
    ...agent,
    run: (ctx) => {
      contexts.set(ctx, { ...NO_SESSION, ...extras })
      return agent.run(ctx)
    },
  }
}
