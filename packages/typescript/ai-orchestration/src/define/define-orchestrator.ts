import { defineWorkflow } from './define-workflow'
import type {
  AgentMap,
  BoundAgents,
  InferSchema,
  SchemaInput,
  StepGenerator,
  WorkflowDefinition,
} from '../types'

export type RouterDecision<
  TAgents extends AgentMap,
  TOutputSchema extends SchemaInput | undefined,
> =
  | {
      done: true
      output: TOutputSchema extends SchemaInput
        ? InferSchema<TOutputSchema>
        : unknown
    }
  | {
      done?: false
      agent: keyof TAgents
      input: unknown
    }

export interface DefineOrchestratorConfig<
  TInputSchema extends SchemaInput | undefined,
  TOutputSchema extends SchemaInput | undefined,
  TStateSchema extends SchemaInput | undefined,
  TAgents extends AgentMap,
> {
  name: string
  description?: string
  input?: TInputSchema
  output?: TOutputSchema
  state?: TStateSchema
  agents: TAgents
  initialize?: (args: {
    input: TInputSchema extends SchemaInput
      ? InferSchema<TInputSchema>
      : unknown
  }) => TStateSchema extends SchemaInput
    ? Partial<InferSchema<TStateSchema>>
    : Record<string, unknown>
  /** Max routing turns before forcing termination. Default 12. */
  maxTurns?: number
  /**
   * Routing decision generator. Returns `{ done: true, output }` to finish,
   * or `{ agent: 'name', input: {...} }` to dispatch to a declared agent.
   *
   * `lastResult` is the typed output of the agent dispatched on the previous
   * turn (or `undefined` on turn 0). The router uses it to fold an agent's
   * structured output into workflow `state` — without it the engine has no
   * channel for the dispatched agent's return value, leaving the router blind
   * to its own decisions and prone to infinite-loop on stateless triage.
   */
  router: (args: {
    input: TInputSchema extends SchemaInput
      ? InferSchema<TInputSchema>
      : unknown
    state: TStateSchema extends SchemaInput
      ? InferSchema<TStateSchema>
      : Record<string, unknown>
    agents: BoundAgents<TAgents>
    turn: number
    lastResult: unknown
  }) => StepGenerator<RouterDecision<TAgents, TOutputSchema>>
}

export function defineOrchestrator<
  TInputSchema extends SchemaInput | undefined = undefined,
  TOutputSchema extends SchemaInput | undefined = undefined,
  TStateSchema extends SchemaInput | undefined = undefined,
  TAgents extends AgentMap = AgentMap,
>(
  config: DefineOrchestratorConfig<
    TInputSchema,
    TOutputSchema,
    TStateSchema,
    TAgents
  >,
): WorkflowDefinition<TInputSchema, TOutputSchema, TStateSchema, TAgents> {
  const maxTurns = config.maxTurns ?? 12

  return defineWorkflow({
    name: config.name,
    description: config.description,
    input: config.input,
    output: config.output,
    state: config.state,
    agents: config.agents,
    initialize: config.initialize,
    // eslint-disable-next-line @typescript-eslint/require-await
    run: async function* (args) {
      let lastResult: unknown = undefined
      for (let turn = 0; turn < maxTurns; turn++) {
        const decision = yield* config.router({
          input: args.input as any,
          state: args.state as any,
          agents: args.agents,
          turn,
          lastResult,
        })

        if (decision.done) {
          return decision.output as any
        }

        const agentName = decision.agent as string
        const boundAgent = (args.agents as any)[agentName]
        if (typeof boundAgent !== 'function') {
          throw new Error(
            `Orchestrator "${config.name}": router returned unknown agent "${agentName}"`,
          )
        }
        lastResult = yield* boundAgent(decision.input)
      }

      throw new Error(
        `Orchestrator "${config.name}": exceeded maxTurns (${maxTurns})`,
      )
    },
  })
}
