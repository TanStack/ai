import type {
  AgentMap,
  BoundAgents,
  InferSchema,
  SchemaInput,
  StepGenerator,
} from '../types'
import type { RouterDecision } from './define-orchestrator'

/**
 * Configuration shape used to derive router argument types. Pass the same
 * config object to `defineRouter` and `defineOrchestrator` so types align.
 */
export interface RouterConfig<
  TInputSchema extends SchemaInput | undefined,
  TOutputSchema extends SchemaInput | undefined,
  TStateSchema extends SchemaInput | undefined,
  TAgents extends AgentMap,
> {
  agents: TAgents
  input?: TInputSchema
  output?: TOutputSchema
  state?: TStateSchema
}

/**
 * Type-preserving wrapper for orchestrator router functions. Lets you define
 * the router outside the `defineOrchestrator(...)` call site without losing
 * inference on `input`, `state`, or `agents`.
 *
 *     const config = { input, output, state, agents }
 *     const myRouter = defineRouter(config, function* ({ input, state, agents }) {
 *       const triage = yield* agents.triage({ ... })  // fully typed
 *       return { agent: 'spec', input: { ... } }
 *     })
 *     defineOrchestrator({ ...config, router: myRouter })
 *
 * The first `_config` argument is used only for type inference — the runtime
 * ignores it. This is the standard "phantom config" pattern for capturing
 * generic type parameters.
 */
export function defineRouter<
  TInputSchema extends SchemaInput | undefined,
  TOutputSchema extends SchemaInput | undefined,
  TStateSchema extends SchemaInput | undefined,
  TAgents extends AgentMap,
>(
  _config: RouterConfig<TInputSchema, TOutputSchema, TStateSchema, TAgents>,
  router: (args: {
    agents: BoundAgents<TAgents>
    input: TInputSchema extends SchemaInput ? InferSchema<TInputSchema> : unknown
    state: TStateSchema extends SchemaInput
      ? InferSchema<TStateSchema>
      : Record<string, unknown>
    turn: number
  }) => StepGenerator<RouterDecision<TAgents, TOutputSchema>>,
) {
  return router
}
