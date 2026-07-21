import {
  AgentApprovalUnsupportedError,
  AgentStreamError,
  AgentValidationError,
} from './agent'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { StreamChunk } from '@tanstack/ai'
import type { AgentDefinition, AgentRunValue, AgentStreamResult } from './types'

const NO_STRUCTURED_OUTPUT = Symbol('no-structured-output')

export async function executeAgent<TInput, TOutput>(args: {
  definition: AgentDefinition<TInput, TOutput>
  input: TInput
  signal: AbortSignal
  emit: (chunk: StreamChunk) => void
}): Promise<TOutput> {
  const { definition } = args
  const input = definition.inputSchema
    ? await validateSchema(
        definition.inputSchema,
        args.input,
        `Input validation failed for agent "${definition.name}"`,
      )
    : args.input
  const { abortController, cleanup } = linkedAbortController(args.signal)

  try {
    const result = await definition.run({
      input,
      signal: abortController.signal,
      abortController,
    })

    if (isAgentStreamResult<TOutput>(result)) {
      await drainAgentStream(definition.name, result.stream, args.emit)
      return validateOutput(definition, await result.output)
    }

    if (isAsyncIterable<StreamChunk>(result)) {
      const output = await drainAgentStream(definition.name, result, args.emit)
      return validateOutput(definition, output)
    }

    return validateOutput(definition, result)
  } finally {
    cleanup()
  }
}

async function drainAgentStream(
  agentName: string,
  stream: AsyncIterable<StreamChunk>,
  emit: (chunk: StreamChunk) => void,
): Promise<unknown> {
  let text = ''
  let structuredOutput: unknown | typeof NO_STRUCTURED_OUTPUT =
    NO_STRUCTURED_OUTPUT

  for await (const chunk of stream) {
    if (chunk.type === 'RUN_STARTED' || chunk.type === 'RUN_FINISHED') {
      continue
    }
    if (chunk.type === 'RUN_ERROR') {
      throw new AgentStreamError(agentName, chunk.message, chunk.code)
    }
    if (chunk.type === 'CUSTOM' && chunk.name === 'approval-requested') {
      throw new AgentApprovalUnsupportedError(agentName)
    }

    emit(chunk)

    if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
      text += chunk.delta
    } else if (
      chunk.type === 'CUSTOM' &&
      chunk.name === 'structured-output.complete' &&
      isRecord(chunk.value) &&
      'object' in chunk.value
    ) {
      structuredOutput = chunk.value.object
    }
  }

  return structuredOutput === NO_STRUCTURED_OUTPUT ? text : structuredOutput
}

async function validateOutput<TInput, TOutput>(
  definition: AgentDefinition<TInput, TOutput>,
  rawOutput: unknown,
): Promise<TOutput> {
  if (!definition.outputSchema) return rawOutput as TOutput

  let candidate = rawOutput
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate)
    } catch {
      // Let the schema report the useful validation issue for plain text.
    }
  }

  return validateSchema(
    definition.outputSchema,
    candidate,
    `Output validation failed for agent "${definition.name}"`,
  )
}

async function validateSchema<TOutput>(
  schema: StandardSchemaV1<unknown, TOutput>,
  value: unknown,
  message: string,
): Promise<TOutput> {
  const result = await schema['~standard'].validate(value)
  if (result.issues) {
    throw new AgentValidationError(message, result.issues)
  }
  return result.value
}

function linkedAbortController(signal: AbortSignal): {
  abortController: AbortController
  cleanup: () => void
} {
  const abortController = new AbortController()
  const abort = () => abortController.abort(signal.reason)

  if (signal.aborted) {
    abort()
    return { abortController, cleanup: () => undefined }
  }

  signal.addEventListener('abort', abort, { once: true })
  return {
    abortController,
    cleanup: () => signal.removeEventListener('abort', abort),
  }
}

function isAgentStreamResult<TOutput>(
  value: AgentRunValue<TOutput>,
): value is AgentStreamResult<TOutput> {
  return isRecord(value) && value.kind === 'agent-stream'
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    Symbol.asyncIterator in value
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
