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

  const result = agent.run({ input, emit, signal }) as AgentRunResult<T>
  const candidate = result as unknown

  // Shape (c): { stream, output }
  // Guard against false-positives where a user returns a plain object
  // that happens to have `stream` and `output` keys but the values
  // aren't an AsyncIterable and a Promise. We require `stream` to be
  // async-iterable AND `output` to be thenable before taking this path;
  // otherwise the engine would crash on `result.stream` iteration with
  // a confusing TypeError instead of treating the value as shape (b).
  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    'stream' in candidate &&
    'output' in candidate &&
    isAsyncIterable((candidate as { stream: unknown }).stream) &&
    isThenable((candidate as { output: unknown }).output)
  ) {
    const shapeC = candidate as {
      stream: AsyncIterable<StreamChunk>
      output: Promise<T>
    }
    return {
      stream: filterInnerRunBoundaries(shapeC.stream),
      output: shapeC.output.then((o) => parseOutput<T>(agent, o)),
    }
  }

  // Shape (a): AsyncIterable<StreamChunk>
  if (typeof result === 'object' && Symbol.asyncIterator in (result as any)) {
    const stream = result as AsyncIterable<StreamChunk>
    let resolveOutput!: (val: T) => void
    let rejectOutput!: (err: unknown) => void
    const output = new Promise<T>((res, rej) => {
      resolveOutput = res
      rejectOutput = rej
    })

    async function* drain(): AsyncIterable<StreamChunk> {
      let lastTextContent = ''
      // Settled = output Promise has resolved or rejected. We guarantee
      // settlement from a `finally` block so the iterator's async cleanup
      // path (early break by the outer consumer, abort during streaming,
      // unexpected return) cannot leave `await output` dangling forever.
      let settled = false
      const settleResolve = (value: T) => {
        if (settled) return
        settled = true
        resolveOutput(value)
      }
      const settleReject = (err: unknown) => {
        if (settled) return
        settled = true
        rejectOutput(err)
      }
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
          settleResolve(parsed)
        } catch (err) {
          settleReject(err)
        }
      } catch (err) {
        settleReject(err)
        throw err
      } finally {
        // If neither the success nor catch path settled (e.g. the
        // consumer broke out of iteration before completion via the
        // generator's `.return()` hook), reject so awaiters observe a
        // clean failure instead of hanging forever. TS narrows `settled`
        // to `true` via the visible mutations, but early-return through
        // the iterator skips both branches — hence the cast.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!settled) {
          settleReject(
            new Error(
              `Agent "${agent.name}" stream was abandoned before producing output`,
            ),
          )
        }
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

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  if (value === null || typeof value !== 'object') return false
  return Symbol.asyncIterator in value
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (value === null || typeof value !== 'object') return false
  return typeof (value as { then?: unknown }).then === 'function'
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
