import type {
  AgentMap,
  InferSchema,
  SchemaInput,
  StepDescriptor,
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
    run: config.run,
  }
}
