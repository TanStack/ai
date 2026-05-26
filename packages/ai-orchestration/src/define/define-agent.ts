import type {
  AgentDefinition,
  AgentRunArgs,
  AgentRunResult,
  InferSchema,
  SchemaInput,
} from '../types'

export interface DefineAgentConfig<
  TInputSchema extends SchemaInput | undefined,
  TOutputSchema extends SchemaInput | undefined,
  TName extends string,
> {
  name: TName
  description?: string
  input?: TInputSchema
  output?: TOutputSchema
  run: (
    args: AgentRunArgs<
      TInputSchema extends SchemaInput ? InferSchema<TInputSchema> : unknown
    >,
  ) => AgentRunResult<
    TOutputSchema extends SchemaInput ? InferSchema<TOutputSchema> : unknown
  >
}

export function defineAgent<
  TInputSchema extends SchemaInput | undefined = undefined,
  TOutputSchema extends SchemaInput | undefined = undefined,
  TName extends string = string,
>(
  config: DefineAgentConfig<TInputSchema, TOutputSchema, TName>,
): AgentDefinition<TInputSchema, TOutputSchema, TName> {
  return {
    __kind: 'agent',
    name: config.name,
    description: config.description,
    inputSchema: config.input,
    outputSchema: config.output,
    run: config.run,
  }
}
