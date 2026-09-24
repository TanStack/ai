import { boolean, choice } from '../../evaluate/index'
import type { DefinedAgent } from './define-agent'
import type { SubagentOrder, SubagentRouterPick } from './spawn'

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

  function pick(result: RouteAnswers<TAgents>): SubagentRouterPick {
    const names = agents
      .map((agent) => agent.name)
      .filter((name) => result[name as TAgents[number]['name']].value)
    if (names.length === 0) return 'main'
    const only = names.length === 1 ? names[0] : undefined
    if (only !== undefined) return only
    const later = new Set(options?.then ?? [])
    const lead = names.filter((name) => !later.has(name))
    const tail = names.filter((name) => later.has(name))
    if (lead.length === 0 || tail.length === 0) {
      return { names, order: result.order.value }
    }
    return {
      steps: [
        lead.length > 1
          ? { names: lead, order: 'parallel' as const }
          : { names: lead },
        tail.length > 1
          ? { names: tail, order: 'sequence' as const }
          : { names: tail },
      ],
    }
  }

  return { questions: questions as RouteQuestions<TAgents>, pick }
}
