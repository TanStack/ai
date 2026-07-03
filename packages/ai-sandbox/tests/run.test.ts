import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { InMemoryRunEventLog } from '../src/run-log'
import { RunController, pipeToRunLog } from '../src/run'
import type { StreamChunk } from '@tanstack/ai'

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

describe('RunController', () => {
  it('start returns immediately; done/drain resolve to the final record', async () => {
    const log = new InMemoryRunEventLog()
    const controller = new RunController(log)

    const { runId, done } = controller.start({
      runId: 'r1',
      stream: fromChunks([text('a'), text('b')]),
    })
    expect(runId).toBe('r1')

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
})
