import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { StreamChunk } from '@tanstack/ai'

// ==========================================
// Standard Schema helpers
// ==========================================

export type SchemaInput = StandardSchemaV1
export type InferSchema<T> = T extends StandardSchemaV1<infer _, infer Out>
  ? Out
  : never

// ==========================================
// Agent
// ==========================================

export type AgentRunArgs<TInput> = {
  input: TInput
  emit: EmitFn
  signal: AbortSignal
}

export type AgentRunResult<TOutput> =
  | AsyncIterable<StreamChunk>
  | Promise<TOutput>
  | { stream: AsyncIterable<StreamChunk>; output: Promise<TOutput> }

export interface AgentDefinition<
  TInputSchema extends SchemaInput | undefined,
  TOutputSchema extends SchemaInput | undefined,
  TName extends string = string,
> {
  __kind: 'agent'
  name: TName
  description?: string
  inputSchema?: TInputSchema
  outputSchema?: TOutputSchema
  run: (
    args: AgentRunArgs<
      TInputSchema extends SchemaInput ? InferSchema<TInputSchema> : unknown
    >,
  ) => AgentRunResult<
    TOutputSchema extends SchemaInput ? InferSchema<TOutputSchema> : unknown
  >
}

export type AnyAgentDefinition = AgentDefinition<any, any, string>

// ==========================================
// Workflow
// ==========================================

export type WorkflowRunArgs<TInput, TState, TAgents extends AgentMap> = {
  input: TInput
  state: TState
  agents: BoundAgents<TAgents>
  emit: EmitFn
  signal: AbortSignal
}

export type AgentMap = Record<string, AnyAgentDefinition | AnyWorkflowDefinition>

export type BoundAgents<TAgents extends AgentMap> = {
  [K in keyof TAgents]: TAgents[K] extends AgentDefinition<
    infer TIn,
    infer TOut,
    any
  >
    ? (
        input: TIn extends SchemaInput ? InferSchema<TIn> : unknown,
      ) => StepGenerator<
        TOut extends SchemaInput ? InferSchema<TOut> : unknown
      >
    : TAgents[K] extends WorkflowDefinition<
          infer WIn,
          infer WOut,
          any,
          any
        >
      ? (
          input: WIn extends SchemaInput ? InferSchema<WIn> : unknown,
        ) => StepGenerator<WOut extends SchemaInput ? InferSchema<WOut> : unknown>
      : never
}

export interface WorkflowDefinition<
  TInputSchema extends SchemaInput | undefined,
  TOutputSchema extends SchemaInput | undefined,
  TStateSchema extends SchemaInput | undefined,
  TAgents extends AgentMap,
> {
  __kind: 'workflow'
  name: string
  description?: string
  inputSchema?: TInputSchema
  outputSchema?: TOutputSchema
  stateSchema?: TStateSchema
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
      TStateSchema extends SchemaInput ? InferSchema<TStateSchema> : Record<string, unknown>,
      TAgents
    >,
  ) => AsyncGenerator<
    StepDescriptor,
    TOutputSchema extends SchemaInput ? InferSchema<TOutputSchema> : unknown,
    unknown
  >
}

export type AnyWorkflowDefinition = WorkflowDefinition<any, any, any, any>

// ==========================================
// Step descriptors
// ==========================================

export type StepDescriptor =
  | { kind: 'agent'; name: string; input: unknown; agent: AnyAgentDefinition }
  | { kind: 'nested-workflow'; name: string; input: unknown; workflow: AnyWorkflowDefinition }
  | { kind: 'approval'; title: string; description?: string }

export type StepGenerator<T> = Generator<StepDescriptor, T, T>

// ==========================================
// Approval result
// ==========================================

export interface ApprovalResult {
  approved: boolean
  approvalId: string
}

// ==========================================
// Emit
// ==========================================

export type EmitFn = (name: string, value: Record<string, unknown>) => void

// ==========================================
// Run state
// ==========================================

export type RunStatus =
  | 'running'
  | 'paused'
  | 'finished'
  | 'error'
  | 'aborted'

export interface RunState<TInput = unknown, TState = unknown, TOutput = unknown> {
  runId: string
  status: RunStatus
  workflowName: string
  input: TInput
  state: TState
  output?: TOutput
  error?: { name: string; message: string; stack?: string }
  pendingApproval?: { approvalId: string; title: string; description?: string }
  createdAt: number
  updatedAt: number
}

// ==========================================
// RunStore
// ==========================================

export type DeleteReason = 'finished' | 'error' | 'aborted'

export interface RunStore {
  get(runId: string): Promise<RunState | undefined>
  set(runId: string, state: RunState): Promise<void>
  delete(runId: string, reason: DeleteReason): Promise<void>
}

// ==========================================
// Engine-internal: live (non-serializable) run handle
// ==========================================
export interface LiveRun {
  runState: RunState
  generator: AsyncGenerator<StepDescriptor, unknown, unknown>
  abortController: AbortController
  approvalResolver?: (result: ApprovalResult) => void
}
