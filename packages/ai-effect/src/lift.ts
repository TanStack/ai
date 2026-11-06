import { Data, Effect, Stream } from 'effect'

/**
 * The error of every `@tanstack/ai-effect` call. It wraps a rejection or a
 * throw from TanStack AI. `cause` holds the original value.
 */
export class AIError extends Data.TaggedError('AIError')<{
  readonly message: string
  readonly cause: unknown
}> {}

const toAIError = (cause: unknown) =>
  new AIError({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  })

/**
 * Turns a promise call into a lazy `Effect`. Each run calls `run` with a new
 * `AbortSignal`. Interruption aborts that signal. A throw or a rejection
 * fails the Effect with `AIError`.
 *
 * @example
 * toEffect((signal) => summarize({ adapter, text, abortSignal: signal }))
 */
export const toEffect = <A>(run: (signal: AbortSignal) => Promise<A>) =>
  // The thunk must declare `signal`: tryPromise only makes a controller when the thunk's length is not 0.
  Effect.tryPromise({ try: (signal) => run(signal), catch: toAIError })

/**
 * Turns an async iterable call into a lazy `Stream`. Each run calls `run`
 * with a new `AbortSignal`. The signal aborts when the consumer stops or the
 * stream ends. A throw fails the Stream with `AIError`. Chunks pass through
 * as they are, so a `RUN_ERROR` chunk does not fail the Stream.
 *
 * @example
 * toStream((signal) => chat({ adapter, messages, abortSignal: signal }))
 */
export const toStream = <C>(run: (signal: AbortSignal) => AsyncIterable<C>) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const controller = yield* Effect.acquireRelease(
        Effect.sync(() => new AbortController()),
        (created) => Effect.sync(() => created.abort()),
      )
      const iterable = yield* Effect.try({
        try: () => run(controller.signal),
        catch: toAIError,
      })
      return Stream.fromAsyncIterable(iterable, toAIError)
    }),
  )
