/**
 * The coordinator's driver binding: CORE's `pipeToRunLog`/`RunController`
 * (`@tanstack/ai-sandbox`) driving this package's run log through the two
 * adapters in `src/durability.ts` — `runLogStore` (lifecycle) and
 * `runLogStream` (per-run event log). The driver's own behavior is covered in
 * `packages/ai-sandbox`; what these cases pin down is the FUSION: record and
 * log share one status field, so terminalizing through the `RunStore` must end
 * the log and wake its readers.
 */
import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { RunController } from '@tanstack/ai-sandbox'
import { InMemoryRunEventLog } from '../src/run-log'
import { runLogStore, runLogStream } from '../src/durability'
import type { RunEventLog } from '../src/run-log'
import type { StreamChunk } from '@tanstack/ai'

const text = (delta: string): StreamChunk =>
  ({ type: EventType.TEXT_MESSAGE_CONTENT, delta }) as unknown as StreamChunk

const controllerFor = (log: RunEventLog): RunController =>
  new RunController({
    runs: runLogStore(log),
    durability: (runId) => runLogStream(log, { runId }),
  })

async function* fromChunks(
  chunks: Array<StreamChunk>,
): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) {
    await Promise.resolve()
    yield chunk
  }
}

async function collect<T>(it: AsyncIterable<T>): Promise<Array<T>> {
  const out: Array<T> = []
  for await (const v of it) out.push(v)
  return out
}

describe('core run driver over the run log', () => {
  it('drives a run to completed; the log holds the chunks and is terminal', async () => {
    const log = new InMemoryRunEventLog()
    const { done } = controllerFor(log).start({
      runId: 'r1',
      threadId: 't1',
      stream: fromChunks([text('a'), text('b')]),
    })

    const record = await done
    expect(record.status).toBe('completed')
    expect(record.threadId).toBe('t1')
    expect(record.finishedAt).toBeDefined()

    // The log is terminal, so a from-start read replays and RETURNS.
    const events = await collect(log.read('r1'))
    expect(events.map((e) => e.seq)).toEqual([0, 1])
  })

  it('a RUN_ERROR chunk lands in the log and fails the record', async () => {
    const log = new InMemoryRunEventLog()
    const runError = {
      type: EventType.RUN_ERROR,
      message: 'boom',
      code: 'E_BOOM',
    } as unknown as StreamChunk
    const { done } = controllerFor(log).start({
      runId: 'r1',
      threadId: 't1',
      stream: fromChunks([text('a'), runError]),
    })

    const record = await done
    expect(record.status).toBe('failed')
    expect(record.error).toEqual({ message: 'boom', code: 'E_BOOM' })
    const events = await collect(log.read('r1'))
    expect(events[events.length - 1]!.chunk.type).toBe(EventType.RUN_ERROR)
  })

  it("terminalizing through the RunStore ends the log: a parked live-tailer returns on the driver's terminal update", async () => {
    const log = new InMemoryRunEventLog()
    const ac = new AbortController()

    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    async function* gated(): AsyncIterable<StreamChunk> {
      yield text('a')
      await gate
    }
    const { done } = controllerFor(log).start({
      runId: 'r1',
      threadId: 't1',
      stream: gated(),
      signal: ac.signal,
    })

    // Reader tails while the run is live. Core's driver will terminalize via
    // `runs.update('aborted')`, NOT `log.finish` — if that update did not wake
    // the in-memory waiter set, this reader would park forever.
    const reading = collect(log.read('r1'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    ac.abort()
    release()

    expect((await done).status).toBe('aborted')
    const events = await reading
    expect(events.map((e) => e.seq)).toEqual([0])
  })

  it('findActiveRun answers the most recent running run for the thread', async () => {
    const log = new InMemoryRunEventLog()
    const runs = runLogStore(log)
    await log.open({ runId: 'old', threadId: 't1', startedAt: 100 })
    await log.open({ runId: 'new', threadId: 't1', startedAt: 200 })
    await log.open({ runId: 'other', threadId: 't2', startedAt: 300 })
    await log.open({ runId: 'finished', threadId: 't1', startedAt: 400 })
    await log.finish('finished', 'completed')

    expect((await runs.findActiveRun('t1'))?.runId).toBe('new')
    expect(await runs.findActiveRun('t3')).toBeNull()
    // update on an unknown run is a no-op, never a create.
    await runs.update('ghost', { status: 'failed' })
    expect(await runs.get('ghost')).toBeNull()
  })

  it('runLogStream: snapshot is bounded while open, [] when unknown; foreign offsets reject', async () => {
    const log = new InMemoryRunEventLog()
    await log.open({ runId: 'r1', threadId: 't1' })
    const stream = runLogStream(log, { runId: 'r1' })
    const [first] = await stream.append([text('a'), text('b')])
    if (first === undefined) throw new Error('expected offsets')

    // No close() — the log is open. A read would park; snapshot must not.
    expect((await stream.snapshot()).map((e) => e.offset)).toContain(first)
    expect(await runLogStream(log, { runId: 'ghost' }).snapshot()).toEqual([])

    await log.open({ runId: 'r2', threadId: 't1' })
    const other = runLogStream(log, { runId: 'r2' })
    const read = async (): Promise<void> => {
      for await (const _ of other.read(first)) void _
    }
    await expect(read()).rejects.toThrow(/belongs to run "r1"/)
  })
})
