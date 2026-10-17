import type {
  AgentProduces,
  DefinedAgent,
  InferSchemaType,
  SchemaInput,
} from '@tanstack/ai'
import { registerSubagentContextDefaults } from '@tanstack/ai/adapter-internals'
import { stepRunWithoutSession } from './durable-tool'
import { waitUntil } from './utils'
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

/** `ctx.harness.agents`: start agents in the background. */
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
   * The steps of the run. In a run started with `resume: true`, a
   * finished step returns its stored value when the run
   * runs again, and `fn` does not run again. Else `fn` runs each time,
   * and `sleep` waits its full time.
   */
  step: ToolStep
  /** Start agents in the background, as children of this run. */
  agents: AgentStarter
}

/**
 * `ctx.harness` outside a run that a session started from code (a tool-mode
 * child of a chat turn, or a run that a plain `chat()` starts): `step.do`
 * runs `fn` each time, `step.sleep` waits its full time, `agents.start`
 * throws.
 */
export const NO_SESSION_CONTEXT: HarnessAgentContext = {
  // `fn` runs each time, so it needs no JSON copy.
  step: {
    do: async (name, fn) => fn(stepRunWithoutSession(name)),
    sleep: ({ ms }) => waitUntil(Date.now() + ms),
  },
  agents: {
    start: () => {
      throw new Error(
        'ctx.harness.agents needs a run that a harness session started.',
      )
    },
  },
}

// A run that a plain chat() starts gets NO_SESSION_CONTEXT, so ctx.harness is
// always there. The sideEffects field of package.json keeps this module.
registerSubagentContextDefaults(() => ({ harness: NO_SESSION_CONTEXT }))

declare module '@tanstack/ai' {
  /**
   * `ctx.harness` in the `run` of an agent: `step` and `agents`. A harness
   * session gives them to each agent run it starts from code (a session
   * agent, `ctx.harness.agents.start`, a background child), and to the
   * children those runs start through `ctx.chat({ subagents })`. Any
   * other run, for example one that a plain `chat()` starts, gets
   * `NO_SESSION_CONTEXT`: `step.do` runs `fn` each time, and `agents.start`
   * throws.
   */
  interface SubagentContextExtension {
    harness: HarnessAgentContext
  }
}
