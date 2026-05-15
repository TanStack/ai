import type {
  AgentMap,
  InferSchema,
  SchemaInput,
  StepDescriptor,
  StepRetryOptions,
  WorkflowDefinition,
  WorkflowRunArgs,
} from '../types'

export interface DefineWorkflowConfig<
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
  /**
   * Default retry policy applied to every `step()` call in this
   * workflow that doesn't carry its own `{ retry }` option. Useful for
   * coarse-grained policies like "retry transient errors up to 3 times
   * with exponential backoff" without repeating it at every site.
   */
  defaultStepRetry?: StepRetryOptions
  run: (
    args: WorkflowRunArgs<
      TInputSchema extends SchemaInput ? InferSchema<TInputSchema> : unknown,
      TStateSchema extends SchemaInput
        ? InferSchema<TStateSchema>
        : Record<string, unknown>,
      TAgents
    >,
  ) => AsyncGenerator<
    StepDescriptor,
    TOutputSchema extends SchemaInput ? InferSchema<TOutputSchema> : unknown,
    unknown
  >
}

export function defineWorkflow<
  TInputSchema extends SchemaInput | undefined = undefined,
  TOutputSchema extends SchemaInput | undefined = undefined,
  TStateSchema extends SchemaInput | undefined = undefined,
  TAgents extends AgentMap = AgentMap,
>(
  config: DefineWorkflowConfig<
    TInputSchema,
    TOutputSchema,
    TStateSchema,
    TAgents
  >,
): WorkflowDefinition<TInputSchema, TOutputSchema, TStateSchema, TAgents> {
  return {
    __kind: 'workflow',
    name: config.name,
    description: config.description,
    inputSchema: config.input,
    outputSchema: config.output,
    stateSchema: config.state,
    agents: config.agents,
    initialize: config.initialize,
    defaultStepRetry: config.defaultStepRetry,
    run: config.run,
  }
}
