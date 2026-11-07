import { describe, expect, it } from 'vitest'
import { Effect, Fiber, Stream } from 'effect'
import { AIError, toEffect, toStream } from '../src/lift'

type Chunk = { type: string; delta?: string }

const failureOf = <A>(effect: Effect.Effect<A, AIError>) =>
  Effect.runPromise(Effect.flip(effect))

const collect = <C>(stream: Stream.Stream<C, AIError>) =>
  Effect.runPromise(Stream.runCollect(stream))

describe('toEffect', () => {
  it('resolves the promise value', async () => {
    const value = await Effect.runPromise(toEffect(() => Promise.resolve(42)))

    expect(value).toBe(42)
  })

  it('maps a rejection to AIError with the cause', async () => {
    const error = await failureOf(toEffect(() => Promise.reject('nope')))

    expect(error).toBeInstanceOf(AIError)
    expect(error.message).toBe('nope')
    expect(error.cause).toBe('nope')
  })

  it('maps a sync throw from run to AIError', async () => {
    const thrown = new Error('threadId is empty')
    const error = await failureOf(
      toEffect(() => {
        throw thrown
      }),
    )

    expect(error._tag).toBe('AIError')
    expect(error.message).toBe('threadId is empty')
    expect(error.cause).toBe(thrown)
  })

  it('interruption aborts the signal', async () => {
    let seen: AbortSignal | undefined
    let markStarted = () => {}
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const fiber = Effect.runFork(
      toEffect((signal) => {
        seen = signal
        markStarted()
        return new Promise<never>(() => {})
      }),
    )
    await started

    await Effect.runPromise(Fiber.interrupt(fiber))

    expect(seen?.aborted).toBe(true)
  })

  it('running the same Effect twice calls run twice with two different signals', async () => {
    const signals: Array<AbortSignal> = []
    const effect = toEffect((signal) => {
      signals.push(signal)
      return Promise.resolve('ok')
    })

    await Effect.runPromise(effect)
    await Effect.runPromise(effect)

    expect(signals).toHaveLength(2)
    expect(signals[0]).not.toBe(signals[1])
  })
})

describe('toStream', () => {
  it('emits every chunk, including a RUN_ERROR chunk, and does not fail', async () => {
    const chunks: Array<Chunk> = [
      { type: 'TEXT_MESSAGE_CONTENT', delta: 'Hi' },
      { type: 'RUN_ERROR' },
      { type: 'RUN_FINISHED' },
    ]
    async function* run() {
      yield* chunks
    }

    const out = await collect(toStream(run))

    expect(out).toEqual([
      { type: 'TEXT_MESSAGE_CONTENT', delta: 'Hi' },
      { type: 'RUN_ERROR' },
      { type: 'RUN_FINISHED' },
    ])
  })

  it('maps an iterator throw to AIError', async () => {
    const thrown = new Error('socket closed')
    async function* run() {
      yield { type: 'TEXT_MESSAGE_CONTENT', delta: 'Hi' }
      throw thrown
    }

    const error = await failureOf(Stream.runCollect(toStream(run)))

    expect(error).toBeInstanceOf(AIError)
    expect(error.message).toBe('socket closed')
    expect(error.cause).toBe(thrown)
  })

  it('early stop (Stream.take) aborts the signal', async () => {
    let seen: AbortSignal | undefined
    async function* run(signal: AbortSignal) {
      seen = signal
      while (true) yield { type: 'TEXT_MESSAGE_CONTENT', delta: 'x' }
    }

    const out = await collect(toStream(run).pipe(Stream.take(1)))

    expect(out).toEqual([{ type: 'TEXT_MESSAGE_CONTENT', delta: 'x' }])
    expect(seen?.aborted).toBe(true)
  })
})
