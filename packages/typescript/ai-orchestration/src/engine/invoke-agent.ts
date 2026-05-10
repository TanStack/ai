import type { StreamChunk } from '@tanstack/ai'
import type { AgentRunResult, AnyAgentDefinition } from '../types'

export interface InvokeAgentResult<T> {
  /** Stream of inner chunks to pipe to outer SSE (already filtered for inner RunStarted/Finished). */
  stream: AsyncIterable<StreamChunk>
  /** Resolves with the parsed typed output. */
  output: Promise<T>
}

/**
 * Detect which of the three shapes the agent's `run` returned and normalize
 * to a `{ stream, output }` pair.
 */
export function invokeAgent<T>(
  agent: AnyAgentDefinition,
  input: unknown,
  emit: (name: string, value: Record<string, unknown>) => void,
  signal: AbortSignal,
): InvokeAgentResult<T> {
  // Validate input against schema if provided
  if (agent.inputSchema) {
    const validated = agent.inputSchema['~standard'].validate(input)
    if (validated instanceof Promise) {
      throw new Error(
        `Async input schema validation not supported in v1 (agent "${agent.name}")`,
      )
    }
    if (validated.issues) {
      const err = new SchemaValidationError(
        `Input schema validation failed for agent "${agent.name}"`,
        validated.issues,
      )
      throw err
    }
    input = validated.value
  }

  const result = agent.run({ input, emit, signal } as any) as AgentRunResult<T>

  // Shape (c): { stream, output }
  if (
    typeof result === 'object' &&
    'stream' in result &&
    'output' in result
  ) {
    return {
      stream: filterInnerRunBoundaries(result.stream),
      output: result.output.then((o) => parseOutput<T>(agent, o)),
    }
  }

  // Shape (a): AsyncIterable<StreamChunk>
  if (
    typeof result === 'object' &&
    Symbol.asyncIterator in (result as any)
  ) {
    const stream = result as AsyncIterable<StreamChunk>
    let resolveOutput!: (val: T) => void
    let rejectOutput!: (err: unknown) => void
    const output = new Promise<T>((res, rej) => {
      resolveOutput = res
      rejectOutput = rej
    })

    async function* drain(): AsyncIterable<StreamChunk> {
      let lastTextContent = ''
      try {
        for await (const chunk of filterInnerRunBoundaries(stream)) {
          if (chunk.type === 'TEXT_MESSAGE_CONTENT' && 'delta' in chunk) {
            lastTextContent += String((chunk as any).delta ?? '')
          }
          yield chunk
        }
        // Try to parse final text as the typed output via the agent's outputSchema.
        try {
          const parsed = parseOutputFromText<T>(agent, lastTextContent)
          resolveOutput(parsed)
        } catch (err) {
          rejectOutput(err)
        }
      } catch (err) {
        rejectOutput(err)
        throw err
      }
    }

    return { stream: drain(), output }
  }

  // Shape (b): Promise<T> (or already-resolved value)
  return {
    stream: emptyStream(),
    output: Promise.resolve(result as T).then((o) => parseOutput<T>(agent, o)),
  }
}

async function* emptyStream(): AsyncIterable<StreamChunk> {
  // intentionally empty
}

/**
 * Filter out RunStartedEvent and RunFinishedEvent emitted by an inner chat()
 * call so the outer workflow run owns the run boundaries.
 */
async function* filterInnerRunBoundaries(
  source: AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
  for await (const chunk of source) {
    if (chunk.type === 'RUN_STARTED' || chunk.type === 'RUN_FINISHED') {
      continue
    }
    yield chunk
  }
}

/**
 * Validate raw output against the agent's outputSchema.
 */
function parseOutput<T>(agent: AnyAgentDefinition, raw: unknown): T {
  if (!agent.outputSchema) return raw as T
  const validated = agent.outputSchema['~standard'].validate(raw)
  if (validated instanceof Promise) {
    throw new Error(
      `Async output schema validation not supported in v1 (agent "${agent.name}")`,
    )
  }
  if (validated.issues) {
    const err = new SchemaValidationError(
      `Output schema validation failed for agent "${agent.name}"`,
      validated.issues,
    )
    throw err
  }
  return validated.value as T
}

/**
 * Parse JSON-shaped agent output from accumulated text. Used when the agent
 * returned a raw stream (no explicit output Promise). For non-JSON outputs
 * (string-typed), the raw text is returned.
 */
function parseOutputFromText<T>(agent: AnyAgentDefinition, text: string): T {
  if (!agent.outputSchema) return text as T
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    // Fall back to raw text — schema validation will fail with a clear message.
    raw = text
  }
  return parseOutput<T>(agent, raw)
}

export class SchemaValidationError extends Error {
  issues: ReadonlyArray<unknown>
  constructor(message: string, issues: ReadonlyArray<unknown>) {
    super(message)
    this.name = 'SchemaValidationError'
    this.issues = issues
  }
}
