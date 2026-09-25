/**
 * The identity binding between a run's lifecycle record and its event log.
 *
 * `RunDeps.durability` used to be a `StreamDurability` INSTANCE while
 * `start({ runId })` / `pipeToRunLog({ runId })` took an arbitrary id. Nothing
 * cross-checked the two, so a mismatch wrote the `RunRecord` under one id and
 * the events under another — silently, at concurrency 1, with `done` still
 * resolving `'completed'` while a client tailing the run it asked for saw an
 * empty log.
 *
 * It is now a factory `(runId) => StreamDurability` resolved from the very
 * `runId` being driven, which makes the mismatch unrepresentable rather than
 * merely documented. This file pins the three properties that claim rests on:
 *
 * 1. the factory is called with EXACTLY the driven `runId`, and exactly ONCE per
 *    run — not once per append, which would let a factory split one run's log;
 * 2. two runs driven through one controller each get their own log, and neither
 *    log contains a single chunk belonging to the other;
 * 3. `attach(runId, fromOffset)` reads the log of the run asked for.
 *
 * Every assertion is paired with a negative (the other run's marker is absent,
 * the other id was never passed) so a "return everything" implementation cannot
 * pass.
 */
import { describe, expect, it, vi } from 'vitest'
import { EventType, InMemoryRunStore } from '@tanstack/ai'
import { RunController, pipeToRunLog } from '../src'
import type { StreamChunk, StreamDurability } from '@tanstack/ai'

/** Unique per execution: a reused id would read another run's state. */
function freshRunId(): string {
  return `r-${crypto.randomUUID()}`
}

interface FakeLog extends StreamDurability {
  entries: Array<StreamChunk>
  closed: boolean
  reads: Array<string>
}

/**
 * A minimal per-run in-memory log. Deliberately NOT `memoryStream`: that keys
 * its store by the `runId` on the request, which would quietly repair a
 * mis-binding this file exists to detect.
 */
function makeLog(): FakeLog {
  const entries: Array<StreamChunk> = []
  const reads: Array<string> = []
  const log: FakeLog = {
    entries,
    closed: false,
    reads,
    resumeFrom: () => null,
    append: (chunks) => {
      const base = entries.length
      entries.push(...chunks)
      return Promise.resolve(chunks.map((_, index) => `o:${base + index}`))
    },
    read: (offset) => {
      reads.push(offset)
      return (async function* () {
        for (const [index, chunk] of entries.entries()) {
          yield { offset: `o:${index}`, chunk }
        }
      })()
    },
    close: () => {
      log.closed = true
      return Promise.resolve()
    },
    snapshot: () =>
      Promise.resolve(
        entries.map((chunk, index) => ({ offset: `o:${index}`, chunk })),
      ),
  }
  return log
}

/**
 * A registry of per-run logs plus a spy factory over it, which is the shape
 * every test here needs: `calls` proves WHICH id the driver resolved with, and
 * `logs` proves WHERE the chunks landed.
 */
function logRegistry(): {
  durability: (runId: string) => FakeLog
  logs: Map<string, FakeLog>
} {
  const logs = new Map<string, FakeLog>()
  const durability = vi.fn((runId: string) => {
    const existing = logs.get(runId)
    if (existing) return existing
    const created = makeLog()
    logs.set(runId, created)
    return created
  })
  return { durability, logs }
}

/**
 * Three chunks — so "once per run" is distinguishable from "once per append" —
 * every one of them stamped with the run it belongs to.
 */
async function* threeChunks(
  runId: string,
  threadId: string,
): AsyncGenerator<StreamChunk> {
  yield { type: EventType.RUN_STARTED, runId, threadId, timestamp: 1 }
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: `m-${runId}`,
    delta: `body-of-${runId}`,
    timestamp: 1,
  }
  yield { type: EventType.RUN_FINISHED, runId, threadId, timestamp: 1 }
}

/** The `runId` a chunk carries, or `undefined` for chunk types without one. */
function runIdOf(chunk: StreamChunk): string | undefined {
  return 'runId' in chunk && typeof chunk.runId === 'string'
    ? chunk.runId
    : undefined
}

/** Every run-identifying marker a chunk carries, for cross-talk assertions. */
function markersOf(chunk: StreamChunk): Array<string> {
  const markers: Array<string> = []
  const runId = runIdOf(chunk)
  if (runId !== undefined) markers.push(runId)
  if ('delta' in chunk && typeof chunk.delta === 'string')
    markers.push(chunk.delta)
  if ('messageId' in chunk && typeof chunk.messageId === 'string')
    markers.push(chunk.messageId)
  return markers
}

describe('RunDeps.durability is resolved from the runId being driven', () => {
  it('calls the factory with exactly the driven runId, and never with another', async () => {
    const runId = freshRunId()
    const other = freshRunId()
    const { durability, logs } = logRegistry()

    const record = await pipeToRunLog(threeChunks(runId, 't1'), {
      runs: new InMemoryRunStore(),
      durability,
      runId,
      threadId: 't1',
    })

    expect(record.status).toBe('completed')
    expect(record.runId).toBe(runId)
    expect(durability).toHaveBeenCalledWith(runId)
    expect(durability).not.toHaveBeenCalledWith(other)
    // Exactly one log exists, and it is the one keyed by the driven id.
    expect([...logs.keys()]).toEqual([runId])
    expect(logs.get(runId)?.entries).toHaveLength(3)
  })

  it('calls the factory exactly once per run, not once per append', async () => {
    // Re-resolving mid-run would let a factory hand back a second instance and
    // split one run's log in half — three appends, three logs, one of them
    // closed and the rest wedged open.
    const runId = freshRunId()
    const { durability, logs } = logRegistry()

    await pipeToRunLog(threeChunks(runId, 't1'), {
      runs: new InMemoryRunStore(),
      durability,
      runId,
      threadId: 't1',
    })

    expect(durability).toHaveBeenCalledTimes(1)
    // All three appends and the close landed on the one resolved instance.
    expect(logs.get(runId)?.entries).toHaveLength(3)
    expect(logs.get(runId)?.closed).toBe(true)
  })

  it('keeps the RunRecord and the event log in agreement about the id', async () => {
    const runId = freshRunId()
    const runs = new InMemoryRunStore()
    const { durability, logs } = logRegistry()

    await pipeToRunLog(threeChunks(runId, 't1'), {
      runs,
      durability,
      runId,
      threadId: 't1',
    })

    // The record exists under the driven id...
    const stored = await runs.get(runId)
    expect(stored?.status).toBe('completed')
    // ...and the events are under the SAME id, which is the pairing that used
    // to be able to come apart with no error raised.
    const log = logs.get(stored?.runId ?? '')
    expect(log?.entries).toHaveLength(3)
    for (const chunk of log?.entries ?? []) {
      const chunkRunId = runIdOf(chunk)
      if (chunkRunId !== undefined) expect(chunkRunId).toBe(runId)
    }
  })
})

describe('RunController with a per-run durability factory', () => {
  it('gives concurrent runs separate logs with no cross-talk, and closes each', async () => {
    const first = freshRunId()
    const second = freshRunId()
    const { durability, logs } = logRegistry()
    const controller = new RunController({
      runs: new InMemoryRunStore(),
      durability,
    })

    const a = controller.start({
      runId: first,
      threadId: 't',
      stream: threeChunks(first, 't'),
    })
    const b = controller.start({
      runId: second,
      threadId: 't',
      stream: threeChunks(second, 't'),
    })
    const [recordA, recordB] = await Promise.all([a.done, b.done])

    expect(recordA.status).toBe('completed')
    expect(recordB.status).toBe('completed')
    expect([...logs.keys()].sort()).toEqual([first, second].sort())

    for (const [runId, log] of logs) {
      const foreign = runId === first ? second : first
      expect(log.entries).toHaveLength(3)
      const markers = log.entries.flatMap(markersOf)
      // Positive: every marker in this log names this run.
      expect(markers.every((marker) => marker.includes(runId))).toBe(true)
      // Negative: not one chunk of the other run leaked in. Without a per-run
      // log both runs interleaved into a single instance.
      expect(markers.some((marker) => marker.includes(foreign))).toBe(false)
      // And one run reaching its terminal status no longer terminalizes the
      // other's log — each log is closed by its own run.
      expect(log.closed).toBe(true)
    }
  })

  it('attach() reads the log of the runId asked for, passing the offset through', async () => {
    const driven = freshRunId()
    const other = freshRunId()
    const { durability, logs } = logRegistry()
    const controller = new RunController({
      runs: new InMemoryRunStore(),
      durability,
    })

    await controller.start({
      runId: driven,
      threadId: 't1',
      stream: threeChunks(driven, 't1'),
    }).done
    // A second run exists, so "read whatever log we happen to hold" is a
    // distinguishable wrong answer rather than accidentally correct.
    await controller.start({
      runId: other,
      threadId: 't1',
      stream: threeChunks(other, 't1'),
    }).done

    const seen: Array<string> = []
    for await (const event of controller.attach(driven, 'o:0')) {
      for (const marker of markersOf(event.chunk)) seen.push(marker)
    }

    // The read went to the driven run's log, at the offset asked for...
    expect(logs.get(driven)?.reads).toEqual(['o:0'])
    // ...and not to the other run's.
    expect(logs.get(other)?.reads).toEqual([])
    expect(seen.every((marker) => marker.includes(driven))).toBe(true)
    expect(seen.some((marker) => marker.includes(other))).toBe(false)
  })
})
