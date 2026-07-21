import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { StreamChunk } from '@tanstack/ai'
import type {
  AgentDefinition,
  AgentRunResult,
  AgentStreamResult,
} from './types'

export interface DefineAgentConfig<TInput, TOutput, TName extends string> {
  name: TName
  description?: string
  input?: StandardSchemaV1<unknown, TInput>
  output?: StandardSchemaV1<unknown, TOutput>
  run: (context: {
    input: TInput
    signal: AbortSignal
    abortController: AbortController
  }) => AgentRunResult<TOutput>
}

export function defineAgent<TInput, TOutput, const TName extends string>(
  config: DefineAgentConfig<TInput, TOutput, TName> & {
    output: StandardSchemaV1<unknown, TOutput>
  },
): AgentDefinition<TInput, TOutput, TName>
export function defineAgent<
  TInput = unknown,
  const TName extends string = string,
>(
  config: DefineAgentConfig<TInput, string, TName> & { output?: undefined },
): AgentDefinition<TInput, string, TName>
export function defineAgent<TInput, TOutput, const TName extends string>(
  config: DefineAgentConfig<TInput, TOutput, TName>,
): AgentDefinition<TInput, TOutput, TName> {
  return {
    kind: 'agent',
    name: config.name,
    description: config.description,
    inputSchema: config.input,
    outputSchema: config.output,
    run: config.run,
  }
}

export function agentStream<TOutput>(
  stream: AsyncIterable<StreamChunk>,
  output: TOutput | Promise<TOutput>,
): AgentStreamResult<TOutput> {
  return { kind: 'agent-stream', stream, output }
}

export class AgentValidationError extends Error {
  override name = 'AgentValidationError'

  constructor(
    message: string,
    readonly issues: ReadonlyArray<unknown>,
  ) {
    super(message)
  }
}

export class AgentApprovalUnsupportedError extends Error {
  override name = 'AgentApprovalUnsupportedError'

  constructor(agentName: string) {
    super(
      `Agent "${agentName}" paused for an AI tool approval inside a durable step. Use Workflow ctx.approve() between agent calls until approval resumption is defined.`,
    )
  }
}

export class AgentStreamError extends Error {
  override name = 'AgentStreamError'

  constructor(
    agentName: string,
    message: string,
    readonly code?: string,
  ) {
    super(`Agent "${agentName}" failed: ${message}`)
  }
}
