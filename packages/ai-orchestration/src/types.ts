import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { StreamChunk } from '@tanstack/ai'
import type { StepOptions } from '@tanstack/workflow-core'

export type SchemaInput = StandardSchemaV1
export type InferSchema<TSchema> =
  TSchema extends StandardSchemaV1<infer _Input, infer Output> ? Output : never

export interface AgentRunContext<TInput> {
  input: TInput
  /** Aborts with the enclosing Workflow step, including step timeouts. */
  signal: AbortSignal
  /** Linked controller for TanStack AI APIs that accept an AbortController. */
  abortController: AbortController
}

export interface AgentStreamResult<TOutput> {
  readonly kind: 'agent-stream'
  stream: AsyncIterable<StreamChunk>
  output: TOutput | Promise<TOutput>
}

export type AgentRunValue<TOutput> =
  | TOutput
  | AsyncIterable<StreamChunk>
  | AgentStreamResult<TOutput>

export type AgentRunResult<TOutput> =
  | AgentRunValue<TOutput>
  | Promise<AgentRunValue<TOutput>>

export interface AgentDefinition<
  TInput = unknown,
  TOutput = unknown,
  TName extends string = string,
> {
  readonly kind: 'agent'
  readonly name: TName
  readonly description?: string
  readonly inputSchema?: StandardSchemaV1<unknown, TInput>
  readonly outputSchema?: StandardSchemaV1<unknown, TOutput>
  readonly run: (context: AgentRunContext<TInput>) => AgentRunResult<TOutput>
}

// `any` is intentional at this erased registry boundary. The conditional
// helpers below recover each concrete definition's input and output types.
// oxlint-disable-next-line typescript/no-explicit-any
export type AnyAgentDefinition = AgentDefinition<any, any, string>

export type AgentInput<TAgent extends AnyAgentDefinition> =
  TAgent extends AgentDefinition<infer Input, infer _Output, string>
    ? Input
    : never

export type AgentOutput<TAgent extends AnyAgentDefinition> =
  TAgent extends AgentDefinition<infer _Input, infer Output, string>
    ? Output
    : never

export type AgentOptions = StepOptions

export interface AIWorkflowContext {
  agent: <TAgent extends AnyAgentDefinition>(
    id: string,
    definition: TAgent,
    input: AgentInput<TAgent>,
    options?: AgentOptions,
  ) => Promise<AgentOutput<TAgent>>
}
