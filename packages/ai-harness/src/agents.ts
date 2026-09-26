import type {
  AgentProduces,
  DefinedAgent,
  InferSchemaType,
  SchemaInput,
} from '@tanstack/ai'

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

  list(): ReadonlyArray<AnyAgent> {
    return [...this.agents.values()].map((entry) => entry.agent)
  }

  get(name: string): AnyAgent | undefined {
    return this.agents.get(name)?.agent
  }

  find(query: { produces: AgentProduces }): AnyAgent | undefined {
    return this.list().find((agent) => agent.produces === query.produces)
  }

  /** A copy for one chat turn, so run plugins can add agents for that turn only. */
  fork(): AgentRegistry {
    const copy = new AgentRegistry()
    for (const [name, entry] of this.agents) copy.agents.set(name, entry)
    return copy
  }
}
