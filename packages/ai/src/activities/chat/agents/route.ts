import { boolean, choice } from '../../evaluate'
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
 * `pick` returns `main`, one name, or `{ names, order }`.
 * Names follow the `agents` array order.
 * `{ names, order }` overrides `subagents.order` for that turn.
 */
export function subagentRoute<
  const TAgents extends ReadonlyArray<DefinedAgent>,
>(agents: TAgents, options?: SubagentRouteOptions<TAgents>) {
  for (const agent of agents) {
    if (agent.name === ORDER_KEY) {
      throw new Error(
        'subagentRoute cannot use an agent named "order". Rename that agent.',
      )
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
    return { names, order: result.order.value }
  }

  return { questions: questions as RouteQuestions<TAgents>, pick }
}
