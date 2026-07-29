/**
 * Coverage for `sandboxRunDriver` (`src/driver.ts`) — the wiring that fills in
 * core's injected `claim`/`pipe` seams with this package's real ones.
 *
 * This file is written adversarially against the three ways the wiring can be
 * wrong while still *looking* right (a test that only asserted "pipe was
 * called" would pass against all three):
 *
 * 1. **The epoch actually carried into the fence.** `pipe` gets no epoch from
 *    core, so the wiring must carry the acquired claim across. A hardcoded
 *    epoch (`0`) is not a weak fence, it is a permanently tripped one:
 *    `withRunClaim` bumps `driverEpoch` to `1` before `fn` runs, so
 *    `observed > claim.epoch` holds on the first append and every takeover
 *    fails. Hence the paired assertions: the fence must PERMIT an append at the
 *    acquired epoch and REFUSE one at a superseded epoch, with the refused path
 *    proven by `snapshot()` — the driven chunk must not be in it.
 * 2. **`close()` must not be fenced.** It runs on the very teardown caused by
 *    losing the claim, so fencing it wedges the record at `'running'` with every
 *    tailer parked forever. The `'close'` op is asserted on the refused path,
 *    which is exactly where a fenced close would throw.
 * 3. **Quiescence before the first append.** Asserted by op ORDER, not by a spy
 *    count: dropping the gate makes the first recorded op an `append`.
 *
 * Every assertion about stored events goes through `(await log.snapshot())` and
 * never through an array handed to `fakeLog` — `fakeLog` COPIES its seed, so
 * asserting on the seed array is vacuous.
 */
import { describe, expect, it } from 'vitest'
import { EventType, InMemoryRunStore } from '@tanstack/ai'
import { InMemoryLockStore } from '@tanstack/ai/locks'
import { fakeLog } from './fakes'
import { RunDriverPipeOutsideClaimError, sandboxRunDriver } from '../src/driver'
import type { LockStore } from '@tanstack/ai/locks'
import type {
  RunDriverOptions,
  StreamChunk,
  StreamDurability,
} from '@tanstack/ai'

function chunk(runId: string, delta: string): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: `${runId}-m`,
    delta,
    timestamp: 1,
  }
}

type LogOp = 'append' | 'close' | 'snapshot'

/**
 * A {@link fakeLog} that records the ORDER of the calls made against it. Order
 * is what proves quiescence ran before the first append and that `close()` still
 * ran after a refused one; a plain call counter proves neither.
 */
function recordingLog(): { log: StreamDurability; ops: Array<LogOp> } {
  const inner = fakeLog()
  const ops: Array<LogOp> = []
  const log: StreamDurability = {
    resumeFrom: () => inner.resumeFrom(),
    append: (chunks) => {
      ops.push('append')
      return inner.append(chunks)
    },
    read: (offset, signal) => inner.read(offset, signal),
    close: () => {
      ops.push('close')
      return inner.close()
    },
    snapshot: () => {
      ops.push('snapshot')
      return inner.snapshot()
    },
  }
  return { log, ops }
}

/**
 * A {@link LockStore} whose lease can be revoked mid-drive. `InMemoryLockStore`
 * hands out a fresh `AbortController().signal` it never aborts, so it cannot
 * exercise the fence's lease branch at all.
 */
function leaseLock(): { locks: LockStore; lose: () => void } {
  let controller: AbortController | undefined
  return {
    locks: {
      withLock: (_key, fn) => {
        controller = new AbortController()
        return fn(controller.signal)
      },
    },
    lose: () => controller?.abort(new Error('lease lost')),
  }
}

/** A run record in `'running'` state, ready to be claimed. */
async function runningRun(runId: string): Promise<InMemoryRunStore> {
  const runs = new InMemoryRunStore()
  await runs.createOrResume({ runId, threadId: `${runId}-t`, startedAt: 1 })
  return runs
}

interface Harness {
  runId: string
  runs: InMemoryRunStore
  driver: RunDriverOptions
  ops: Array<LogOp>
  log: StreamDurability
}

/**
 * Build a driver over one run. `fenceQuietMs: 0` keeps the quiescence gate in
 * the path (it still takes its two snapshots) without a real sleep.
 */
async function harness(
  runId: string,
  options: {
    chunks?: Array<StreamChunk>
    locks?: LockStore
    beforeYield?: () => Promise<void>
  } = {},
): Promise<Harness> {
  const runs = await runningRun(runId)
  const { log, ops } = recordingLog()
  const chunks = options.chunks ?? [chunk(runId, 'hello')]
  const driver = sandboxRunDriver({
    request: new Request(`http://test.local/attach?runId=${runId}&offset=-1`),
    runs,
    locks: options.locks ?? new InMemoryLockStore(),
    durability: () => log,
    fenceQuietMs: 0,
    drive: () => ({
      async *[Symbol.asyncIterator]() {
        await options.beforeYield?.()
        for (const c of chunks) yield c
      },
    }),
  })
  return { runId, runs, driver, ops, log }
}

/** Exactly what core's `startRunDriver` does: claim, then pipe the drive. */
function takeOver(h: Harness): Promise<unknown> {
  const { runId, runs, driver } = h
  const threadId = `${runId}-t`
  return driver.claim({ runs, locks: driver.locks, runId }, (claim) =>
    driver.pipe(driver.drive({ runId, threadId, signal: claim.signal }), {
      runId,
      threadId,
      signal: claim.signal,
    }),
  )
}

describe('sandboxRunDriver — the acquired epoch reaches the fence', () => {
  it('PERMITS appends at the epoch the claim acquired', async () => {
    const h = await harness('drv-permit')
    await takeOver(h)

    // Asserted from the log itself, never from an array passed to `fakeLog`.
    const stored = await h.log.snapshot()
    expect(stored.map((entry) => entry.chunk)).toEqual([
      chunk('drv-permit', 'hello'),
    ])
    // A hardcoded `epoch: 0` fences this out: the claim bumped driverEpoch to 1.
    expect((await h.runs.get('drv-permit'))?.driverEpoch).toBe(1)
    expect((await h.runs.get('drv-permit'))?.status).toBe('completed')
  })

  it('REFUSES appends once a higher epoch exists, and nothing lands', async () => {
    const h = await harness('drv-superseded', {
      // Supersede us between the claim and the first append, exactly as a
      // successor host claiming the run would.
      beforeYield: () => h.runs.update('drv-superseded', { driverEpoch: 99 }),
    })
    await takeOver(h)

    // FIRST: the harm the fence exists to prevent — a superseded host writing
    // the run's events a second time. If the refused append had landed, a later
    // status assertion would have tripped first and masked it.
    const stored = (await h.log.snapshot()).map((entry) => entry.chunk)
    expect(stored).not.toContainEqual(chunk('drv-superseded', 'hello'))
    // What DOES land is `pipeToRunLog`'s recovery `RUN_ERROR`, and only because
    // `fenceDurability` re-reads the epoch every `epochRecheckAppends` appends
    // (`claim.ts`) — the refusal consumed that budget, so the next append rides
    // the throttle window. Pinned rather than glossed: it is one chunk, it is
    // the failure being reported, and tightening it belongs in the fence, not
    // here.
    expect(stored).toEqual([
      {
        type: EventType.RUN_ERROR,
        message:
          'run drv-superseded: driver claim lost (held epoch 1, observed 99)',
      },
    ])
    const record = await h.runs.get('drv-superseded')
    expect(record?.status).toBe('failed')
    expect(record?.error?.message).toContain('driver claim lost')
  })

  it('closes the log on the refused path', async () => {
    const h = await harness('drv-close', {
      beforeYield: () => h.runs.update('drv-close', { driverEpoch: 99 }),
    })
    await takeOver(h)

    expect(h.ops.filter((op) => op === 'close')).toEqual(['close'])
  })

  it('closes the log when the LEASE is lost — close() must NOT be fenced', async () => {
    const lease = leaseLock()
    const h = await harness('drv-close-lease', {
      locks: lease.locks,
      beforeYield: () => {
        lease.lose()
        return Promise.resolve()
      },
    })
    await takeOver(h)

    // The lease branch of the fence is synchronous and UNTHROTTLED (unlike the
    // epoch re-read), so this is the case that actually proves `close()` is
    // outside the fence: route it through and it throws, the underlying log
    // never closes, the record stays wedged at 'running', and every live tailer
    // parks forever — a durability `read` only ends when the log closes.
    expect(h.ops.filter((op) => op === 'close')).toEqual(['close'])
    expect((await h.runs.get('drv-close-lease'))?.status).toBe('aborted')
  })
})

describe('sandboxRunDriver — quiescence gate', () => {
  it('waits for the log to quiesce BEFORE the first append', async () => {
    const h = await harness('drv-quiesce')
    await takeOver(h)

    const firstAppend = h.ops.indexOf('append')
    expect(firstAppend).toBeGreaterThan(0)
    // `awaitLogQuiescence` compares two snapshots, so at least two precede it.
    expect(
      h.ops.slice(0, firstAppend).filter((op) => op === 'snapshot').length,
    ).toBeGreaterThanOrEqual(2)
    expect(h.ops[0]).toBe('snapshot')
  })
})

describe('sandboxRunDriver — pipe outside a claim', () => {
  it('throws rather than appending unfenced at an unknown epoch', async () => {
    const h = await harness('drv-unclaimed')
    const threadId = 'drv-unclaimed-t'

    await expect(
      h.driver.pipe(
        h.driver.drive({
          runId: 'drv-unclaimed',
          threadId,
          signal: new AbortController().signal,
        }),
        {
          runId: 'drv-unclaimed',
          threadId,
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toBeInstanceOf(RunDriverPipeOutsideClaimError)

    // Nothing may reach the log without a claim: an unfenced append is the
    // duplicate-write bug the claim exists to prevent.
    expect(await h.log.snapshot()).toEqual([])
    expect(h.ops).not.toContain('append')
  })

  it('releases the claim slot when the claim callback returns', async () => {
    const h = await harness('drv-released')
    await takeOver(h)

    const threadId = 'drv-released-t'
    await expect(
      h.driver.pipe(
        h.driver.drive({
          runId: 'drv-released',
          threadId,
          signal: new AbortController().signal,
        }),
        {
          runId: 'drv-released',
          threadId,
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toBeInstanceOf(RunDriverPipeOutsideClaimError)
  })
})

describe('sandboxRunDriver — pass-through wiring', () => {
  it('forwards request/runs/locks/drive and the optional waitUntil', async () => {
    const runs = await runningRun('drv-wiring')
    const locks = new InMemoryLockStore()
    const request = new Request('http://test.local/attach?runId=drv-wiring')
    const kept: Array<Promise<unknown>> = []
    const driver = sandboxRunDriver({
      request,
      runs,
      locks,
      durability: () => fakeLog(),
      drive: () => ({ async *[Symbol.asyncIterator]() {} }),
      waitUntil: (promise) => kept.push(promise),
    })

    expect(driver.request).toBe(request)
    expect(driver.runs).toBe(runs)
    expect(driver.locks).toBe(locks)
    expect(typeof driver.waitUntil).toBe('function')
    driver.waitUntil?.(Promise.resolve())
    expect(kept).toHaveLength(1)
  })

  it('omits waitUntil entirely when none is supplied', async () => {
    const runs = await runningRun('drv-no-waituntil')
    const driver = sandboxRunDriver({
      request: new Request('http://test.local/attach?runId=drv-no-waituntil'),
      runs,
      locks: new InMemoryLockStore(),
      durability: () => fakeLog(),
      drive: () => ({ async *[Symbol.asyncIterator]() {} }),
    })
    expect('waitUntil' in driver).toBe(false)
  })

  it('refuses the claim on a terminal run, so pipe never runs', async () => {
    const h = await harness('drv-terminal')
    await h.runs.update('drv-terminal', { status: 'completed', finishedAt: 2 })

    await expect(takeOver(h)).rejects.toThrow('driver claim not acquired')
    expect(h.ops).not.toContain('append')
  })
})
