// packages/ai/src/activities/chain/index.ts
import { EventType } from '@ag-ui/core'
import { toRunErrorPayload } from '../error-payload.js'
import { CHAIN_EVENTS } from './types.js'
import type {
  Chain,
  ChainContext,
  ChainRunOptions,
  ChainStep,
  ChainStepEventValue,
  ChainStream,
} from './types.js'
import type { StreamChunk } from '../../types.js'

export { CHAIN_EVENTS } from './types.js'
export type {
  Chain,
  ChainContext,
  ChainResultMeta,
  ChainRunOptions,
  ChainStep,
  ChainStepEventValue,
  ChainStepResult,
  ChainStream,
  InferChainInput,
  InferChainOutput,
  ResolveStepResult,
} from './types.js'

// ============================================================================
// Internals
// ============================================================================

type AnyStepFn = (input: unknown, ctx: ChainContext) => unknown

type ChainNode =
  | { kind: 'step'; name: string; run: AnyStepFn }
  | { kind: 'parallel'; name: string; branches: Record<string, AnyStepFn> }

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value != null && typeof value === 'object' && Symbol.asyncIterator in value
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

function customChunk(name: string, value: unknown): StreamChunk {
  return { type: EventType.CUSTOM, name, value, timestamp: Date.now() }
}

function stepChunk(value: ChainStepEventValue): StreamChunk {
  return customChunk(CHAIN_EVENTS.STEP, value)
}

/**
 * Unbounded push channel so parallel branches (and `ctx.emit`) can
 * interleave chunks into the single combined stream. Pushes after close are
 * dropped.
 */
function createEventChannel(): {
  push: (chunk: StreamChunk) => void
  close: () => void
  [Symbol.asyncIterator]: () => AsyncIterator<StreamChunk>
} {
  const queue: Array<StreamChunk> = []
  let notify: (() => void) | null = null
  let closed = false

  return {
    push(chunk) {
      if (closed) return
      queue.push(chunk)
      notify?.()
    },
    close() {
      closed = true
      notify?.()
    },
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<StreamChunk>> {
          for (;;) {
            const chunk = queue.shift()
            if (chunk !== undefined) return { value: chunk, done: false }
            if (closed) return { value: undefined, done: true }
            await new Promise<void>((resolve) => {
              notify = resolve
            })
            notify = null
          }
        },
      }
    },
  }
}

/**
 * Resolve a step callback's raw return value to the value handed to the
 * next step, forwarding stream chunks along the way:
 * - async iterable → iterate; strip inner RUN_* lifecycle; capture
 *   `structured-output.complete` (forwarded) or `generation:result`
 *   (suppressed — the outer chain emits its own) as the resolved value;
 *   accumulate TEXT_MESSAGE_CONTENT deltas as the fallback (plain chat).
 * - anything else → await it.
 */
async function resolveStepValue(
  raw: unknown,
  push: (chunk: StreamChunk) => void,
  signal: AbortSignal,
): Promise<unknown> {
  if (!isAsyncIterable(raw)) {
    return await raw
  }

  let resolved: unknown
  let hasResolved = false
  let text = ''

  for await (const chunk of raw as AsyncIterable<StreamChunk>) {
    throwIfAborted(signal)
    if (
      chunk.type === EventType.RUN_STARTED ||
      chunk.type === EventType.RUN_FINISHED
    ) {
      // Inner run lifecycle stays private — the outer chain's RUN_* are
      // authoritative for the combined stream.
      continue
    }
    if (chunk.type === EventType.RUN_ERROR) {
      const message =
        typeof chunk.message === 'string' ? chunk.message : 'Step failed'
      throw new Error(message)
    }
    if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
      if (typeof chunk.delta === 'string') text += chunk.delta
      push(chunk)
      continue
    }
    if (chunk.type === EventType.CUSTOM) {
      if (chunk.name === 'structured-output.complete') {
        if (isRecord(chunk.value) && 'object' in chunk.value) {
          resolved = chunk.value.object
          hasResolved = true
        }
        push(chunk)
        continue
      }
      if (chunk.name === 'generation:result') {
        // A nested chain (or wrapped one-shot) finishing — capture, don't
        // forward: only the outer chain emits generation:result.
        resolved = chunk.value
        hasResolved = true
        continue
      }
    }
    push(chunk)
  }

  throwIfAborted(signal)
  return hasResolved ? resolved : text
}

/** Run every node sequentially, pushing progress into the channel. */
async function executeNodes(
  nodes: Array<ChainNode>,
  input: unknown,
  push: (chunk: StreamChunk) => void,
  ctx: ChainContext,
): Promise<unknown> {
  let value = input

  for (const [index, node] of nodes.entries()) {
    throwIfAborted(ctx.signal)

    if (node.kind === 'step') {
      push(stepChunk({ step: node.name, index, status: 'started' }))
      try {
        value = await resolveStepValue(node.run(value, ctx), push, ctx.signal)
      } catch (err) {
        if (!isAbortError(err)) {
          push(
            stepChunk({
              step: node.name,
              index,
              status: 'error',
              error: toRunErrorPayload(err, 'Step failed').message,
            }),
          )
        }
        throw err
      }
      push(stepChunk({ step: node.name, index, status: 'done', result: value }))
      continue
    }

    // Parallel fan-out: same input to every branch, output keyed by branch.
    const stepInput = value
    const entries = await Promise.all(
      Object.entries(node.branches).map(async ([branch, run]) => {
        push(stepChunk({ step: node.name, index, branch, status: 'started' }))
        try {
          const branchValue = await resolveStepValue(
            run(stepInput, ctx),
            push,
            ctx.signal,
          )
          push(
            stepChunk({
              step: node.name,
              index,
              branch,
              status: 'done',
              result: branchValue,
            }),
          )
          return [branch, branchValue] as const
        } catch (err) {
          if (!isAbortError(err)) {
            push(
              stepChunk({
                step: node.name,
                index,
                branch,
                status: 'error',
                error: toRunErrorPayload(err, 'Step failed').message,
              }),
            )
          }
          throw err
        }
      }),
    )
    value = Object.fromEntries(entries)
  }

  return value
}

// ============================================================================
// Builder
// ============================================================================

class ChainImpl {
  constructor(private readonly nodes: Array<ChainNode>) {}

  step(
    nameOrStep: string | ChainStep<unknown, unknown>,
    run?: AnyStepFn,
  ): ChainImpl {
    if (typeof nameOrStep === 'string') {
      if (!run) {
        throw new Error(`chain step "${nameOrStep}" is missing its callback`)
      }
      return new ChainImpl([
        ...this.nodes,
        { kind: 'step', name: nameOrStep, run },
      ])
    }
    return new ChainImpl([
      ...this.nodes,
      { kind: 'step', name: nameOrStep.name, run: nameOrStep.run },
    ])
  }

  parallel(name: string, branches: Record<string, AnyStepFn>): ChainImpl {
    return new ChainImpl([...this.nodes, { kind: 'parallel', name, branches }])
  }

  stream(
    input: unknown,
    options?: ChainRunOptions,
  ): AsyncGenerator<StreamChunk> {
    const nodes = this.nodes
    const abortController = options?.abortController ?? new AbortController()
    const { signal } = abortController
    const runId = options?.runId ?? createId('chain')
    const threadId = options?.threadId ?? createId('thread')

    return (async function* run(): AsyncGenerator<StreamChunk> {
      const channel = createEventChannel()
      const ctx: ChainContext = {
        signal,
        abortController,
        threadId,
        runId,
        emit: (name, value) => channel.push(customChunk(name, value)),
      }

      const closeOnAbort = () => channel.close()
      signal.addEventListener('abort', closeOnAbort, { once: true })

      const work = executeNodes(nodes, input, channel.push, ctx).finally(() => {
        signal.removeEventListener('abort', closeOnAbort)
        channel.close()
      })
      // Observe the rejection even if the consumer abandons this generator
      // early — `await work` below is unreachable in that case.
      void work.catch(() => {})

      yield {
        type: EventType.RUN_STARTED,
        runId,
        threadId,
        timestamp: Date.now(),
      }

      try {
        for await (const chunk of channel) {
          throwIfAborted(signal)
          yield chunk
        }
        const result = await work
        throwIfAborted(signal)

        yield customChunk('generation:result', result)
        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          finishReason: 'stop',
          timestamp: Date.now(),
        }
      } catch (err) {
        if (signal.aborted || isAbortError(err)) {
          yield {
            type: EventType.RUN_ERROR,
            message: 'Aborted',
            timestamp: Date.now(),
          }
          return
        }
        const payload = toRunErrorPayload(err, 'Chain failed')
        const codeFields =
          payload.code !== undefined ? { code: payload.code } : undefined
        yield {
          type: EventType.RUN_ERROR,
          message: payload.message,
          ...codeFields,
          timestamp: Date.now(),
        }
      }
    })()
  }

  async invoke(input: unknown, options?: ChainRunOptions): Promise<unknown> {
    const abortController = options?.abortController ?? new AbortController()
    const ctx: ChainContext = {
      signal: abortController.signal,
      abortController,
      threadId: options?.threadId ?? createId('thread'),
      runId: options?.runId ?? createId('chain'),
      emit: () => {},
    }
    return await executeNodes(this.nodes, input, () => {}, ctx)
  }

  asStep(name = 'chain'): ChainStep<unknown, unknown> {
    return {
      name,
      run: (input, ctx) =>
        this.stream(input, {
          abortController: ctx.abortController,
          threadId: ctx.threadId,
        }) as ChainStream<unknown>,
    }
  }
}

/**
 * Create a server-side chain: a fluent pipeline of activity steps that
 * executes on the server and streams back as if it were a single activity.
 *
 * Each `.step()` receives the previous step's resolved output — streaming
 * results (`chat` with `stream: true`) are forwarded live into the combined
 * stream while their final value feeds the next step. `.parallel()` fans the
 * same input out to named branches and merges a keyed record.
 *
 * ```ts
 * const blogChain = chain<{ topic: string }>()
 *   .step('draft', ({ topic }, ctx) =>
 *     chat({ adapter, messages, outputSchema, stream: true,
 *            abortController: ctx.abortController }),
 *   )
 *   .parallel('media', {
 *     hero: (post) => generateImage({ adapter, prompt: heroPromptFor(post) }),
 *     narration: (post) => generateSpeech({ adapter, text: post.body }),
 *   })
 *
 * return toServerSentEventsResponse(blogChain.stream({ topic }))
 * ```
 */
export function chain<TIn = unknown>(): Chain<TIn, TIn> {
  return new ChainImpl([]) as Chain<TIn, TIn>
}
