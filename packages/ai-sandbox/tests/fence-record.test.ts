/**
 * Coverage for the run RECORD half of the fence (`fenceRunStore` in
 * `src/claim.ts`), driven through the code path that actually reaches it:
 * `pipeToRunLog`.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `claim.test.ts`. Fencing the event log
 * only moved the harm. A superseded driver's refused append throws
 * `RunClaimLostError`, `pipeToRunLog` catches it and calls
 * `finish(ctx, 'failed', …)`, and that `runs.update` used to be unfenced — so the
 * dead host could not poison the successor's log but still marked the successor's
 * live run terminal. `isTerminalRunStatus` then answers `true` for a run that is
 * streaming, which is exactly what `findActiveRun`, the resume driver's
 * skip-if-terminal check, and the Phase 4 reaper branch on. Every test here is
 * written so that removing the suppression makes it fail.
 *
 * THE TWO FAILURE MODES ARE BOTH COVERED, because the fix has a worse sibling:
 * suppressing too much. A never-terminal run is worse than a falsely-terminal
 * one, so the successor's own terminal write and an unsuperseded run's genuine
 * `'failed'` are asserted alongside, and `close()` is asserted on the suppressed
 * path — a suppression that took the teardown with it would wedge the record at
 * `'running'` with every live tailer parked forever.
 *
 * Every claim below gets its OWN `runId`, and every assertion about stored events
 * goes through `await log.snapshot()` — `fakeLog` copies its seed array, so
 * asserting against the array handed to it is vacuous.
 */
import { describe, expect, it } from 'vitest'
import { EventType, InMemoryRunStore } from '@tanstack/ai'
import { captureLogger, fakeLog, fromChunkValues } from './fakes'
import { fenceDurability, fenceRunStore } from '../src/claim'
import { pipeToRunLog } from '../src/run'
import type { RunClaim } from '../src/claim'
import type { RunRecord, StreamChunk, StreamDurability } from '@tanstack/ai'

function textChunk(runId: string): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: `${runId}-m`,
    delta: 'hello',
    timestamp: 1,
  }
}

/** A `fakeLog` that counts the teardown, which the suppression must not skip. */
function probeLog(): { log: StreamDurability; closes: number } {
  const inner = fakeLog()
  const probe = { closes: 0 }
  const log: StreamDurability = {
    resumeFrom: () => inner.resumeFrom(),
    append: (chunks) => inner.append(chunks),
    read: (offset, signal) => inner.read(offset, signal),
    close: () => {
      probe.closes += 1
      return inner.close()
    },
    snapshot: () => inner.snapshot(),
  }
  return {
    log,
    get closes() {
      return probe.closes
    },
  }
}

/** A run record in `'running'` state at `driverEpoch`, i.e. already claimed. */
async function claimedRun(
  runId: string,
  driverEpoch: number,
): Promise<InMemoryRunStore> {
  const runs = new InMemoryRunStore()
  await runs.createOrResume({ runId, threadId: `${runId}-t`, startedAt: 1 })
  await runs.update(runId, { driverEpoch })
  return runs
}

function claimAt(
  runId: string,
  epoch: number,
  signal: AbortSignal = new AbortController().signal,
): RunClaim {
  return { runId, epoch, signal }
}

/**
 * Exactly the wiring `sandboxRunDriver.pipe` builds: both seams fenced by ONE
 * claim, `close()` outside both.
 */
function driveFenced(
  input: {
    runs: InMemoryRunStore
    log: StreamDurability
    claim: RunClaim
    stream: AsyncIterable<StreamChunk>
  },
  logger?: ReturnType<typeof captureLogger>['logger'],
): Promise<RunRecord> {
  const { runs, log, claim } = input
  return pipeToRunLog(input.stream, {
    runs: fenceRunStore(runs, claim, logger === undefined ? {} : { logger }),
    durability: () => fenceDurability(log, claim, { runs }),
    runId: claim.runId,
    threadId: `${claim.runId}-t`,
    ...(logger === undefined ? {} : { logger }),
  })
}

/** A stream that throws instead of producing its first chunk. */
function throwingStream(error: Error): AsyncIterable<StreamChunk> {
  return {
    [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
  }
}

describe('a superseded driver cannot terminalize the run record', () => {
  it('leaves the record running, resolves anyway, and writes NOTHING to the log', async () => {
    // The load-bearing case. The successor claimed at epoch 9; this host still
    // holds 1, so its append is refused, `pipeToRunLog` folds the
    // `RunClaimLostError` in, and the terminal `runs.update` it then attempts is
    // the write under test.
    const runId = 'fr-superseded'
    const runs = await claimedRun(runId, 9)
    const probe = probeLog()

    const record = await driveFenced({
      runs,
      log: probe.log,
      claim: claimAt(runId, 1),
      stream: fromChunkValues([textChunk(runId)]),
    })

    // Resolved, not rejected: `RunController.start` consumes this promise
    // fire-and-forget, so a rejection would be an unhandled one with nobody to
    // report it to. A suppressed write must not become a new throw.
    expect(record.runId).toBe(runId)

    const stored = await runs.get(runId)
    expect(stored?.status).toBe('running')
    expect(stored?.finishedAt).toBeUndefined()
    expect(stored?.error).toBeUndefined()
    // Still the successor's epoch: nothing about the record moved.
    expect(stored?.driverEpoch).toBe(9)

    // Regression guard for the log half of the fence, asserted through
    // `snapshot()` rather than a seed array: not the driven chunk, and not
    // `pipeToRunLog`'s recovery `RUN_ERROR` either.
    expect(await probe.log.snapshot()).toEqual([])
  })

  it('still closes the log, so no tailer is parked forever', async () => {
    // `close()` is outside both fences on purpose: it runs on the very teardown
    // that losing the claim causes. Skip it and the record is wedged at
    // `'running'` with every live `read` parked, which is worse than the write
    // this suppression prevents.
    const runId = 'fr-close'
    const runs = await claimedRun(runId, 4)
    const probe = probeLog()

    await driveFenced({
      runs,
      log: probe.log,
      claim: claimAt(runId, 1),
      stream: fromChunkValues([textChunk(runId)]),
    })

    expect(probe.closes).toBe(1)
  })

  it('suppresses `aborted` from a LOST LEASE, which never appends at all', async () => {
    // A lost lease aborts `claim.signal`, and `pipeToRunLog` reads that as an
    // abort BEFORE its first append — so no append is ever refused and no latch
    // is ever tripped by the log. The gate is `isTerminalRunStatus`, not "did an
    // append refuse", which is what makes this case covered.
    const runId = 'fr-lease'
    const runs = await claimedRun(runId, 1)
    const probe = probeLog()
    const controller = new AbortController()
    controller.abort(new Error('lease lost'))

    await driveFenced({
      runs,
      log: probe.log,
      claim: claimAt(runId, 1, controller.signal),
      stream: fromChunkValues([textChunk(runId)]),
    })

    const stored = await runs.get(runId)
    expect(stored?.status).toBe('running')
    expect(stored?.finishedAt).toBeUndefined()
    expect(probe.closes).toBe(1)
  })

  it('suppresses `completed` too — an empty stream asserts an outcome as much as a failure', async () => {
    const runId = 'fr-completed'
    const runs = await claimedRun(runId, 12)

    await driveFenced({
      runs,
      log: fakeLog(),
      claim: claimAt(runId, 3),
      stream: fromChunkValues([]),
    })

    expect((await runs.get(runId))?.status).toBe('running')
  })

  it('reports the suppression instead of absorbing it silently', async () => {
    // A detached run has no caller to report to, so an unreported suppression is
    // invisible to an operator wondering why a record never terminalized.
    const runId = 'fr-logged'
    const runs = await claimedRun(runId, 5)
    const captured = captureLogger()

    await driveFenced(
      {
        runs,
        log: fakeLog(),
        claim: claimAt(runId, 1),
        stream: fromChunkValues([textChunk(runId)]),
      },
      captured.logger,
    )

    expect(
      captured.calls.filter((call) =>
        call.msg.includes('suppressed a terminal'),
      ),
    ).toHaveLength(1)
  })
})

describe('the fence must not become a never-terminal bug', () => {
  it('lets the SUCCESSOR terminalize the same run right after the loser was suppressed', async () => {
    // Two hosts, one run, in order. The loser must write nothing and the winner
    // must write everything; a guard that blocked both would replace a
    // false-terminal bug with a never-terminal one, which is strictly worse.
    const runId = 'fr-successor'
    const runs = await claimedRun(runId, 2)

    const loserLog = probeLog()
    await driveFenced({
      runs,
      log: loserLog.log,
      claim: claimAt(runId, 1),
      stream: fromChunkValues([textChunk(runId)]),
    })
    expect((await runs.get(runId))?.status).toBe('running')

    // The successor holds the stored epoch, so its own fence permits everything.
    const winnerLog = probeLog()
    const winner = await driveFenced({
      runs,
      log: winnerLog.log,
      claim: claimAt(runId, 2),
      stream: fromChunkValues([textChunk(runId)]),
    })

    expect(winner.status).toBe('completed')
    const stored = await runs.get(runId)
    expect(stored?.status).toBe('completed')
    expect(stored?.finishedAt).toBeDefined()
    expect(
      (await winnerLog.log.snapshot()).map((entry) => entry.chunk),
    ).toEqual([textChunk(runId)])
    // The loser's log stayed empty throughout.
    expect(await loserLog.log.snapshot()).toEqual([])
  })

  it('still records `failed` for a genuine provider error on an UNSUPERSEDED run', async () => {
    // Proves the suppression keys on claim loss and not on the presence of an
    // error: same terminal write, same fenced store, claim intact.
    const runId = 'fr-genuine'
    const runs = await claimedRun(runId, 1)
    const probe = probeLog()

    const record = await driveFenced({
      runs,
      log: probe.log,
      claim: claimAt(runId, 1),
      stream: throwingStream(new Error('provider exploded')),
    })

    expect(record.status).toBe('failed')
    const stored = await runs.get(runId)
    expect(stored?.status).toBe('failed')
    expect(stored?.error?.message).toContain('provider exploded')
    expect(stored?.finishedAt).toBeDefined()
    // The synthesized RUN_ERROR reached the log, because this claim is held.
    expect((await probe.log.snapshot()).map((entry) => entry.chunk)).toEqual([
      { type: EventType.RUN_ERROR, message: 'provider exploded' },
    ])
  })

  it('does NOT suppress when the epoch read fails: a store blip must not strand the record', async () => {
    // The lease is the primary fence and it has not fired. Treating an
    // unreadable store as loss would refuse a healthy driver's terminal write
    // and leave the run at `'running'` forever.
    const runId = 'fr-blip'
    const runs = await claimedRun(runId, 1)
    const writes: Array<string> = []
    const flaky = fenceRunStore(
      {
        createOrResume: (input) => runs.createOrResume(input),
        get: (id) => {
          writes.push(`get:${id}`)
          return Promise.reject(new Error('store unavailable'))
        },
        update: (id, patch) => {
          if (patch.status !== undefined) writes.push(`update:${patch.status}`)
          return runs.update(id, patch)
        },
      },
      claimAt(runId, 1),
    )

    await flaky.update(runId, { status: 'completed', finishedAt: 2 })

    expect(writes).toContain('update:completed')
    expect((await runs.get(runId))?.status).toBe('completed')
  })
})

describe('non-terminal bookkeeping is deliberately NOT fenced', () => {
  it('lets a superseded host write detachedSince/sandboxKey and create the row', async () => {
    // Decided, not overlooked. None of these can make a live run look finished,
    // so none can mislead `isTerminalRunStatus`, `findActiveRun`, or the reaper;
    // the successor owns the fields and overwrites them. Suppressing them buys
    // nothing and risks stranding a record that has no row at all.
    const runId = 'fr-bookkeeping'
    const runs = await claimedRun(runId, 8)
    const fenced = fenceRunStore(runs, claimAt(runId, 1))

    await fenced.update(runId, { detachedSince: 42, sandboxKey: 'sbx-1' })
    await fenced.createOrResume({
      runId: 'fr-bookkeeping-other',
      threadId: 'fr-bookkeeping-t',
      startedAt: 3,
    })

    const stored = await runs.get(runId)
    expect(stored?.detachedSince).toBe(42)
    expect(stored?.sandboxKey).toBe('sbx-1')
    expect((await runs.get('fr-bookkeeping-other'))?.status).toBe('running')
  })

  it("leaves ANOTHER run's terminal write alone", async () => {
    // The fence knows about `claim.runId` only; a write aimed elsewhere is not
    // this claim's to judge.
    const runId = 'fr-other-run'
    const runs = await claimedRun(runId, 9)
    await runs.createOrResume({
      runId: 'fr-other-run-sibling',
      threadId: 'fr-other-run-t',
      startedAt: 1,
    })
    const fenced = fenceRunStore(runs, claimAt(runId, 1))

    await fenced.update('fr-other-run-sibling', {
      status: 'completed',
      finishedAt: 5,
    })

    expect((await runs.get('fr-other-run-sibling'))?.status).toBe('completed')
  })

  it("forwards the store's optional methods only when it has them", async () => {
    // Consumers feature-detect (`store.findActiveRun?.(…)`), so materializing a
    // method that delegates to a missing one turns a graceful degrade into a
    // TypeError.
    const runId = 'fr-optional'
    const runs = await claimedRun(runId, 1)
    const claim = claimAt(runId, 1)

    // `InMemoryRunStore` is a CLASS: its methods live on the prototype, so a
    // wrapper built by spreading would have dropped every one of them.
    const rich = fenceRunStore(runs, claim)
    expect(await rich.findActiveRun?.(`${runId}-t`)).not.toBeNull()
    expect(await rich.listByThread?.(`${runId}-t`)).toHaveLength(1)
    expect(await rich.listReclaimable?.({ now: 10, ttlMs: 1 })).toHaveLength(0)

    const minimal = fenceRunStore(
      {
        createOrResume: (input) => runs.createOrResume(input),
        get: (id) => runs.get(id),
        update: (id, patch) => runs.update(id, patch),
      },
      claim,
    )
    expect('findActiveRun' in minimal).toBe(false)
    expect('listByThread' in minimal).toBe(false)
    expect('listReclaimable' in minimal).toBe(false)
  })
})
