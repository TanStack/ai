import { boolean, choice } from '../../evaluate/index'
import type { InferSchemaType, SchemaInput } from '../../../types'
import type { DefinedAgent } from './define-agent'
import type { SubagentOrder } from './spawn'

const ORDER_KEY = 'order'

export interface SubagentRouteOptions<
  TAgents extends ReadonlyArray<DefinedAgent>,
> {
  /**
   * Question text for every agent. The key is the agent name.
   * Omit this and each question uses that agent's description.
   */
  when?: { [K in TAgents[number]['name']]: string }
  /**
   * Agents that run after the other selected agents. The lead group starts
   * together. The `then` agents then run one after another in list order, and
   * each reads the text so far. Used only when the router picks at least one
   * agent from each group. Otherwise `pick` returns `{ names, order }`.
   */
  then?: ReadonlyArray<TAgents[number]['name']>
}

type RouteQuestions<TAgents extends ReadonlyArray<DefinedAgent>> = {
  [K in TAgents[number]['name']]: ReturnType<typeof boolean>
} & {
  order: ReturnType<
    typeof choice<{
      parallel: string
      sequence: string
    }>
  >
}

type RouteAnswers<TAgents extends ReadonlyArray<DefinedAgent>> = {
  [K in TAgents[number]['name']]: { value: boolean }
} & {
  order: { value: SubagentOrder }
}

/** The name and the `inputSchema` of an agent that has one. Else `never`. */
type InputNeed<TAgent> = TAgent extends {
  name: infer TName
  inputSchema?: infer TSchema
}
  ? TSchema extends SchemaInput
    ? { name: TName; inputSchema: TSchema }
    : never
  : never

/** One input for each agent with an `inputSchema`, typed from that schema. */
type RouteInputs<TAgents extends ReadonlyArray<DefinedAgent>> = {
  [TNeed in InputNeed<TAgents[number]> as TNeed['name']]?: InferSchemaType<
    TNeed['inputSchema']
  >
}

interface RoutePickOptions<TAgents extends ReadonlyArray<DefinedAgent>> {
  /**
   * The input of each picked agent that has an `inputSchema`. The key is the
   * agent name. `needsInput` lists the agents that need one.
   */
  inputs?: RouteInputs<TAgents>
}

/**
 * Build `decide()` questions for a subagent router.
 *
 * One yes/no question per agent, plus an `order` choice.
 * `pick` returns `main`, one name, `{ names, order }`, or `{ steps }`.
 * Names follow the `agents` array order.
 * `{ names, order }` overrides `subagents.order` for that turn.
 * `then`: agents that run after the other selected agents. The lead group
 * starts together. The `then` agents then run one after another in list
 * order, and each reads the text so far. Used only when the router picks at
 * least one agent from each group. Otherwise `pick` returns `{ names, order }`.
 *
 * An agent with `inputSchema` needs input. `needsInput(result)` lists the
 * picked agents that need it, with their schemas. Make each input, then pass
 * them as `pick(result, { inputs })`. Each name with an input becomes
 * `{ name, input }`. `pick` throws when a picked agent with a schema has no
 * input.
 *
 * @example
 * ```ts
 * const route = subagentRoute(agents)
 * const result = await decide({ adapter, state, questions: route.questions })
 * const inputs = { pricer: { sku: 'A-1' } }
 * return route.pick(result, { inputs })
 * ```
 */
export function subagentRoute<
  const TAgents extends ReadonlyArray<DefinedAgent>,
>(agents: TAgents, options?: SubagentRouteOptions<TAgents>) {
  const namesInList = new Set(agents.map((agent) => agent.name))
  for (const agent of agents) {
    if (agent.name === ORDER_KEY) {
      throw new Error(
        'subagentRoute cannot use an agent named "order". Rename that agent.',
      )
    }
  }
  for (const name of options?.then ?? []) {
    if (!namesInList.has(name)) {
      throw new Error(`subagentRoute then includes unknown agent "${name}".`)
    }
  }

  const questions: Record<string, unknown> = {
    order: choice({
      instructions: 'When more than one agent runs, how must they run?',
      options: {
        parallel:
          'Start them together. Use this when no agent must read text from another agent. Working on the same topic is not a reason to wait.',
        sequence:
          'Run them in agent-list order. Use this only when a later agent must read the earlier agent text, such as research notes and then a draft article.',
      },
    }),
  }

  for (const agent of agents) {
    const when = options?.when?.[agent.name as TAgents[number]['name']]
    questions[agent.name] = boolean({
      instructions: when ?? agent.description,
    })
  }

  /** The agents with a yes answer, in agent-list order. */
  function picked(result: RouteAnswers<TAgents>) {
    return agents.filter(
      (agent) => result[agent.name as TAgents[number]['name']].value,
    )
  }

  /**
   * The picked agents that have an `inputSchema`, in agent-list order. Make
   * an input for each one and pass it to `pick` in `inputs`.
   */
  function needsInput(result: RouteAnswers<TAgents>) {
    const needs = picked(result).flatMap(({ name, inputSchema }) =>
      inputSchema === undefined ? [] : [{ name, inputSchema }],
    )
    // At runtime, `agents` has the wide agent type. It loses the link between
    // each name and its schema, so this names the entry type.
    return needs as Array<InputNeed<TAgents[number]>>
  }

  function pick(
    result: RouteAnswers<TAgents>,
    pickOptions: RoutePickOptions<TAgents> = {},
  ) {
    const inputs: Readonly<Partial<Record<string, unknown>>> =
      pickOptions.inputs ?? {}
    const toPickName = ({ name, inputSchema }: DefinedAgent) => {
      const input = inputs[name]
      if (input !== undefined) return { name, input }
      if (inputSchema !== undefined) {
        throw new Error(`Agent "${name}" needs input. Pass it in inputs.`)
      }
      return name
    }
    const chosen = picked(result)
    const names = chosen.map(toPickName)
    if (names.length === 0) return 'main'
    const only = names.length === 1 ? names[0] : undefined
    if (only !== undefined) return only
    const later = new Set(options?.then ?? [])
    const lead = chosen.filter((agent) => !later.has(agent.name))
    const tail = chosen.filter((agent) => later.has(agent.name))
    if (lead.length === 0 || tail.length === 0) {
      return { names, order: result.order.value }
    }
    return {
      steps: [
        lead.length > 1
          ? { names: lead.map(toPickName), order: 'parallel' as const }
          : { names: lead.map(toPickName) },
        tail.length > 1
          ? { names: tail.map(toPickName), order: 'sequence' as const }
          : { names: tail.map(toPickName) },
      ],
    }
  }

  return { questions: questions as RouteQuestions<TAgents>, pick, needsInput }
}
