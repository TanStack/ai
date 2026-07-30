/**
 * Coverage for this package's relocated legacy run driver (`src/run-driver.ts`).
 *
 * The driver used to live in `@tanstack/ai-sandbox`; the Cloudflare coordinator
 * now owns its own copy over the package-local {@link InMemoryRunEventLog} so
 * the Durable Object keeps the legacy status vocabulary (`done`/`error`/
 * `aborted`). Adapted from the original `packages/ai-sandbox/tests/run.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { InMemoryRunEventLog } from '../src/run-log'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { RunController, pipeToRunLog } from '../src/run-driver'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { RunRecord as LegacyRunRecord } from '../src/run-log'
import type { StreamChunk } from '@tanstack/ai'

/** A real `InternalLogger` whose sink records messages, so no cast is needed. */
function captureLogger(): {
  logger: InternalLogger
  messages: Array<string>
} {
  const messages: Array<string> = []
  const record = (msg: string): void => void messages.push(msg)
  const logger = resolveDebugOption({
    logger: { debug: record, info: record, warn: record, error: record },
  })
  return { logger, messages }
}

/** A minimal valid text chunk. */
const text = (delta: string): StreamChunk =>
  ({ type: EventType.TEXT_MESSAGE_CONTENT, delta }) as unknown as StreamChunk

/** A real RUN_ERROR chunk carrying message/code. */
const runError = (message: string, code?: string): StreamChunk =>
  ({
    type: EventType.RUN_ERROR,
    message,
    ...(code !== undefined ? { code } : {}),
  }) as unknown as StreamChunk

/** Build an AsyncIterable from chunks, optionally throwing after some emit. */
async function* fromChunks(
  chunks: Array<StreamChunk>,
  throwAfter?: { index: number; error: Error },
): AsyncIterable<StreamChunk> {
  for (let i = 0; i < chunks.length; i++) {
    if (throwAfter && i === throwAfter.index) throw throwAfter.error
    // Yield asynchronously to mimic real stream scheduling.
    await Promise.resolve()
    yield chunks[i]!
  }
  if (throwAfter && throwAfter.index >= chunks.length) throw throwAfter.error
}

async function collect<T>(it: AsyncIterable<T>): Promise<Array<T>> {
  const out: Array<T> = []
  for await (const v of it) out.push(v)
  return out
}

const deltas = (chunks: Array<StreamChunk>): Array<unknown> =>
  chunks.map((c) => (c as { delta?: string }).delta)

describe('pipeToRunLog', () => {
  it('happy path: appends chunks in order and finishes done', async () => {
    const log = new InMemoryRunEventLog()
    const record = await pipeToRunLog(
      fromChunks([text('a'), text('b'), text('c')]),
      { log, runId: 'r1', threadId: 't1' },
    )

    expect(record.status).toBe('done')
    expect(record.runId).toBe('r1')
    expect(record.threadId).toBe('t1')
    expect(record.lastSeq).toBe(2)

    const events = await collect(log.read('r1'))
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2])
    expect(deltas(events.map((e) => e.chunk))).toEqual(['a', 'b', 'c'])
  })

  it('threadId is optional: a run opens without one', async () => {
    const log = new InMemoryRunEventLog()
    const record = await pipeToRunLog(fromChunks([text('a')]), {
      log,
      runId: 'r1',
    })

    expect(record.status).toBe('done')
    expect(record.threadId).toBeUndefined()
  })

  it('RUN_ERROR chunk: status error with captured error, chunk in log', async () => {
    const log = new InMemoryRunEventLog()
    const record = await pipeToRunLog(
      fromChunks([text('a'), runError('boom', 'E_BOOM')]),
      { log, runId: 'r1' },
    )

    expect(record.status).toBe('error')
    expect(record.error).toEqual({ message: 'boom', code: 'E_BOOM' })

    // The RUN_ERROR chunk is visible to tailing clients.
    const events = await collect(log.read('r1'))
    const last = events[events.length - 1]!.chunk
    expect(last.type).toBe(EventType.RUN_ERROR)
    expect((last as { message: string }).message).toBe('boom')
  })

  it('thrown stream: synthesizes a RUN_ERROR, finishes error, does not reject', async () => {
    const log = new InMemoryRunEventLog()
    const record = await pipeToRunLog(
      fromChunks([text('a')], { index: 1, error: new Error('kaboom') }),
      { log, runId: 'r1' },
    )

    expect(record.status).toBe('error')
    expect(record.error).toEqual({ message: 'kaboom' })

    const events = await collect(log.read('r1'))
    expect(deltas([events[0]!.chunk])).toEqual(['a'])
    const synthesized = events[events.length - 1]!.chunk
    expect(synthesized.type).toBe(EventType.RUN_ERROR)
    expect((synthesized as { message: string }).message).toBe('kaboom')
  })

  it('already-aborted signal: finishes aborted without consuming the stream', async () => {
    const log = new InMemoryRunEventLog()
    const ac = new AbortController()
    ac.abort()

    let pulled = 0
    async function* counted(): AsyncIterable<StreamChunk> {
      pulled += 1
      await Promise.resolve()
      yield text('a')
    }

    const record = await pipeToRunLog(counted(), {
      log,
      runId: 'r1',
      signal: ac.signal,
    })

    expect(record.status).toBe('aborted')
    expect(record.lastSeq).toBe(-1)
    expect(pulled).toBe(0)
  })

  it('abort mid-stream: status aborted', async () => {
    const log = new InMemoryRunEventLog()
    const ac = new AbortController()
    async function* slow(): AsyncIterable<StreamChunk> {
      await Promise.resolve()
      yield text('a')
      ac.abort()
      yield text('b')
    }

    const record = await pipeToRunLog(slow(), {
      log,
      runId: 'r1',
      signal: ac.signal,
    })
    expect(record.status).toBe('aborted')
    // Only the pre-abort chunk was appended.
    expect(record.lastSeq).toBe(0)
  })
})

/**
 * A log whose chosen methods reject, for the totality tests below. Everything not
 * named in `broken` behaves like the in-memory reference implementation.
 */
class BrokenRunEventLog extends InMemoryRunEventLog {
  constructor(private readonly broken: ReadonlySet<string>) {
    super()
  }

  private boom(method: string): Promise<never> {
    return Promise.reject(new Error(`store down: ${method}`))
  }

  override open(input: {
    runId: string
    threadId?: string
  }): Promise<LegacyRunRecord> {
    if (this.broken.has('open')) return this.boom('open')
    return super.open(input)
  }

  override append(runId: string, chunk: StreamChunk): Promise<number> {
    if (this.broken.has('append')) return this.boom('append')
    return super.append(runId, chunk)
  }

  override finish(
    runId: string,
    status: 'done' | 'error' | 'aborted',
    error?: { message: string; code?: string },
  ): Promise<void> {
    if (this.broken.has('finish')) return this.boom('finish')
    return super.finish(runId, status, error)
  }

  override get(runId: string): Promise<LegacyRunRecord | null> {
    if (this.broken.has('get')) return this.boom('get')
    return super.get(runId)
  }
}

/**
 * `pipeToRunLog`'s "never rejects" doc used to be false in this copy: `log.open`,
 * the terminal `log.finish`, the recovery `append`/`finish`, and the old `reread`
 * throw were unguarded, and `RunController.start` consumes the promise
 * fire-and-forget — so any of them rejecting was an unhandled rejection, which is
 * instance-fatal inside a Durable Object.
 */
describe('pipeToRunLog totality (a throwing log never produces a rejection)', () => {
  const cases: Array<[string, ReadonlySet<string>]> = [
    ['open', new Set(['open'])],
    ['append', new Set(['append'])],
    ['finish', new Set(['finish'])],
    ['the terminal re-read (get)', new Set(['get'])],
    ['every method', new Set(['open', 'append', 'finish', 'get'])],
  ]

  for (const [label, broken] of cases) {
    it(`resolves with a terminal record when ${label} throws`, async () => {
      const { logger, messages } = captureLogger()
      const record = await pipeToRunLog(fromChunks([text('a')]), {
        log: new BrokenRunEventLog(broken),
        runId: 'r1',
        threadId: 't1',
        logger,
      })

      // Terminal, never a rejection, and never a `running` record.
      expect(['done', 'error']).toContain(record.status)
      expect(record.runId).toBe('r1')
      expect(record.threadId).toBe('t1')
      // Absorbed failures are REPORTED rather than swallowed: this module's whole
      // premise is that nobody is listening on the promise.
      expect(messages.length).toBeGreaterThan(0)
    })
  }

  it('a throwing logger cannot break the guarantee it exists to report on', async () => {
    // Deliberately a raw stand-in rather than a real `InternalLogger`: that class
    // already swallows a throwing sink internally, so the only way to exercise
    // `safeLog` is to hand the driver a logger whose `errors` itself throws.
    const exploding = {
      errors: () => {
        throw new Error('logger sink exploded')
      },
    } as unknown as Parameters<typeof pipeToRunLog>[1]['logger']

    const record = await pipeToRunLog(fromChunks([text('a')]), {
      log: new BrokenRunEventLog(new Set(['open', 'finish', 'get'])),
      runId: 'r1',
      logger: exploding,
    })
    expect(record.status).toBe('error')
  })

  it('keeps the primary cause when the recovery append also fails', async () => {
    const record = await pipeToRunLog(
      fromChunks([], { index: 0, error: new Error('provider blew up') }),
      {
        log: new BrokenRunEventLog(new Set(['append'])),
        runId: 'r1',
      },
    )
    expect(record.status).toBe('error')
    // Primary first, secondary named — never replaced.
    expect(record.error?.message).toMatch(/^provider blew up;/)
    expect(record.error?.message).toContain('synthesized RUN_ERROR failed')
  })

  it('RunController.start does not leave an unhandled rejection', async () => {
    const unhandled: Array<unknown> = []
    const onUnhandled = (reason: unknown): void => void unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const controller = new RunController(
        new BrokenRunEventLog(new Set(['open', 'finish', 'get'])),
      )
      const { done } = controller.start({
        runId: 'r1',
        stream: fromChunks([text('a')]),
      })
      await done
      await controller.drain()
      // Let any queued rejection surface before asserting.
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})

describe('RunController', () => {
  it('start returns immediately; done/drain resolve to the final record', async () => {
    const log = new InMemoryRunEventLog()
    const controller = new RunController(log)

    const { runId, done } = controller.start({
      runId: 'r1',
      stream: fromChunks([text('a'), text('b')]),
    })
    expect(runId).toBe('r1')
    // start() did not block on the stream: the run is still open.
    expect((await controller.status('r1'))?.status).toBe('running')

    // drain awaits the in-flight run; done resolves to the terminal record.
    await controller.drain()
    const record = await done
    expect(record.status).toBe('done')
    expect(record.lastSeq).toBe(1)

    expect((await controller.status('r1'))?.status).toBe('done')
  })

  it('attach replays from a cursor', async () => {
    const log = new InMemoryRunEventLog()
    const controller = new RunController(log)

    const { done } = controller.start({
      runId: 'r1',
      stream: fromChunks([text('a'), text('b'), text('c')]),
    })
    await done

    const events = await collect(controller.attach('r1', { fromSeq: 0 }))
    expect(events.map((e) => e.seq)).toEqual([1, 2])
    expect(deltas(events.map((e) => e.chunk))).toEqual(['b', 'c'])
  })

  it('attach replays the backlog then live-tails to terminal', async () => {
    const log = new InMemoryRunEventLog()
    const controller = new RunController(log)

    // Seed a backlog so the attach below has something to replay before it
    // starts tailing an in-flight run.
    await log.open({ runId: 'r1' })
    await log.append('r1', text('a'))
    await log.append('r1', text('b'))

    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    async function* tail(): AsyncIterable<StreamChunk> {
      await gate
      yield text('c')
    }
    const { done } = controller.start({ runId: 'r1', stream: tail() })

    const collected = collect(controller.attach('r1', { fromSeq: 0 }))
    release()
    await done

    const events = await collected
    expect(events.map((e) => e.seq)).toEqual([1, 2])
    expect(deltas(events.map((e) => e.chunk))).toEqual(['b', 'c'])
  })
})
