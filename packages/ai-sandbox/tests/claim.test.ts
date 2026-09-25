/**
 * Coverage for the single-writer run claim (`src/claim.ts`).
 *
 * The point of this file is adversarial, not descriptive: `fenceDurability` is a
 * validation rule, so every test here is written so that removing the rule it
 * covers makes it fail. In particular the `InMemoryLockStore` block proves the
 * epoch fence works in the ONE configuration where the lease provides nothing —
 * `InMemoryLockStore.withLock` hands the callback a fresh
 * `new AbortController().signal` it never aborts, and it QUEUES a second caller
 * rather than refusing it, so `claim.signal` can never fence anything there. If
 * layer 2 were broken, that configuration would silently allow a superseded
 * driver to keep appending.
 */
import { describe, expect, it, vi } from 'vitest'
import { EventType, InMemoryRunStore } from '@tanstack/ai'
// NOT from '@tanstack/ai': the lock primitives live behind their own subpath so
// consumers opt in explicitly (`packages/ai/src/locks.ts`).
import { InMemoryLockStore } from '@tanstack/ai/locks'
import { fakeLog } from './fakes'
import {
  DEFAULT_EPOCH_RECHECK_APPENDS,
  DEFAULT_FENCE_QUIET_MS,
  RunClaimLostError,
  RunClaimNotAcquiredError,
  awaitLogQuiescence,
  fenceDurability,
  runDriverLockKey,
  withRunClaim,
} from '../src/claim'
import type { LockStore } from '@tanstack/ai/locks'
import type { RunClaim } from '../src/claim'
import type { StreamChunk, StreamDurability } from '@tanstack/ai'

function chunk(runId: string): StreamChunk {
  return {
    type: EventType.RUN_STARTED,
    runId,
    threadId: `${runId}-t`,
    timestamp: 1,
  }
}

async function storedCount(log: StreamDurability): Promise<number> {
  return (await log.snapshot()).length
}

/** A run record in `'running'` state, ready to be claimed. */
async function runningRun(runId: string): Promise<InMemoryRunStore> {
  const runs = new InMemoryRunStore()
  await runs.createOrResume({ runId, threadId: `${runId}-t`, startedAt: 1 })
  return runs
}

/** A lock that runs `fn` immediately and can abort its signal on demand. */
function abortableLock(): LockStore & {
  lose: () => void
  keys: Array<string>
} {
  const controllers: Array<AbortController> = []
  const keys: Array<string> = []
  return {
    keys,
    lose: () => controllers.forEach((c) => c.abort()),
    withLock: <T>(key: string, fn: (signal: AbortSignal) => Promise<T>) => {
      keys.push(key)
      const controller = new AbortController()
      controllers.push(controller)
      return fn(controller.signal)
    },
  }
}

/**
 * A lock whose lease signal is a LIVE check rather than a one-way controller, so
 * `aborted` can flap the way a backend polling a lease clock (or re-acquiring a
 * lease) makes it flap. `InMemoryLockStore` cannot model lease loss at all — it
 * hands out a signal it never aborts — and a real `AbortController` cannot be
 * un-aborted, so shadowing `aborted` on the instance is the only way to observe
 * a fence that must stay closed after the signal stops reporting the loss.
 */
function flappableLock(): {
  locks: LockStore
  lose: () => void
  regain: () => void
} {
  let aborted = false
  return {
    lose: () => {
      aborted = true
    },
    regain: () => {
      aborted = false
    },
    locks: {
      withLock: <T>(_key: string, fn: (signal: AbortSignal) => Promise<T>) => {
        const signal = new AbortController().signal
        Object.defineProperty(signal, 'aborted', {
          configurable: true,
          get: () => aborted,
        })
        return fn(signal)
      },
    },
  }
}

describe('runDriverLockKey', () => {
  it('is per-run, so two runs never serialize against each other', () => {
    expect(runDriverLockKey('r1')).toBe('run-driver:r1')
    expect(runDriverLockKey('r2')).not.toBe(runDriverLockKey('r1'))
  })
})

describe('withRunClaim', () => {
  it('takes the per-run lock and bumps driverEpoch from absent to 1', async () => {
    const runs = await runningRun('claim-1')
    const locks = abortableLock()

    const epoch = await withRunClaim(
      { runs, locks, runId: 'claim-1', fenceQuietMs: 0 },
      (claim) => Promise.resolve(claim.epoch),
    )

    expect(epoch).toBe(1)
    expect(locks.keys).toEqual(['run-driver:claim-1'])
    expect((await runs.get('claim-1'))?.driverEpoch).toBe(1)
  })

  it('increments a pre-existing epoch, so a successor always outranks a predecessor', async () => {
    const runs = await runningRun('claim-2')
    await runs.update('claim-2', { driverEpoch: 7 })
    const epoch = await withRunClaim(
      { runs, locks: abortableLock(), runId: 'claim-2', fenceQuietMs: 0 },
      (claim) => Promise.resolve(claim.epoch),
    )
    expect(epoch).toBe(8)
  })

  it('runs the whole body inside the lock, so snapshot and appends are one critical section', async () => {
    const runs = await runningRun('claim-3')
    let insideLock = false
    const locks: LockStore = {
      withLock: async (_key, fn) => {
        insideLock = true
        try {
          return await fn(new AbortController().signal)
        } finally {
          insideLock = false
        }
      },
    }
    await withRunClaim({ runs, locks, runId: 'claim-3' }, () => {
      expect(insideLock).toBe(true)
      return Promise.resolve()
    })
    expect(insideLock).toBe(false)
  })

  it('refuses a terminal run rather than driving a finished one', async () => {
    const runs = await runningRun('claim-4')
    await runs.update('claim-4', { status: 'completed', finishedAt: 2 })
    const body = vi.fn(() => Promise.resolve('ran'))

    await expect(
      withRunClaim(
        { runs, locks: abortableLock(), runId: 'claim-4', fenceQuietMs: 0 },
        body,
      ),
    ).rejects.toBeInstanceOf(RunClaimNotAcquiredError)
    expect(body).not.toHaveBeenCalled()
    // The epoch must NOT be bumped for a refused claim: bumping would fence a
    // healthy driver out of a run this caller never took over.
    expect((await runs.get('claim-4'))?.driverEpoch).toBeUndefined()
  })

  it('refuses an unknown run', async () => {
    await expect(
      withRunClaim(
        {
          runs: new InMemoryRunStore(),
          locks: abortableLock(),
          runId: 'nope',
          fenceQuietMs: 0,
        },
        () => Promise.resolve(1),
      ),
    ).rejects.toBeInstanceOf(RunClaimNotAcquiredError)
  })

  it('reports why the claim was refused', async () => {
    const runs = await runningRun('claim-5')
    await runs.update('claim-5', { status: 'aborted', finishedAt: 2 })
    const refusal = await withRunClaim(
      { runs, locks: abortableLock(), runId: 'claim-5' },
      () => Promise.resolve(1),
    ).catch((error: unknown) => error)
    expect(refusal).toBeInstanceOf(RunClaimNotAcquiredError)
    if (refusal instanceof RunClaimNotAcquiredError) {
      expect(refusal.reason).toBe('terminal')
      expect(refusal.runId).toBe('claim-5')
    }
  })

  it('exposes the lock signal on the claim, so a fence can observe a lost lease', async () => {
    const runs = await runningRun('claim-6')
    const locks = abortableLock()
    await withRunClaim(
      { runs, locks, runId: 'claim-6', fenceQuietMs: 0 },
      (claim) => {
        expect(claim.signal.aborted).toBe(false)
        locks.lose()
        expect(claim.signal.aborted).toBe(true)
        return Promise.resolve()
      },
    )
  })

  it('releases the lock even when the body throws', async () => {
    const runs = await runningRun('claim-7')
    const locks = new InMemoryLockStore()
    await expect(
      withRunClaim({ runs, locks, runId: 'claim-7', fenceQuietMs: 0 }, () =>
        Promise.reject(new Error('drive failed')),
      ),
    ).rejects.toThrow('drive failed')
    // A poisoned lock would deadlock the next claim.
    await expect(
      withRunClaim({ runs, locks, runId: 'claim-7', fenceQuietMs: 0 }, () =>
        Promise.resolve('ok'),
      ),
    ).resolves.toBe('ok')
  })

  it('defaults the quiescence window to 5s and the epoch re-check to 32 appends', () => {
    expect(DEFAULT_FENCE_QUIET_MS).toBe(5_000)
    expect(DEFAULT_EPOCH_RECHECK_APPENDS).toBe(32)
  })
})

describe('awaitLogQuiescence', () => {
  it('resolves with the stored length when two snapshots agree', async () => {
    const log = fakeLog([chunk('quiet-1'), chunk('quiet-1')])
    expect(await awaitLogQuiescence(log, 0)).toBe(2)
  })

  it('resolves 0 for a run with nothing stored', async () => {
    expect(await awaitLogQuiescence(fakeLog(), 0)).toBe(0)
  })

  it('retries while the log is still growing, then settles', async () => {
    const log = fakeLog()
    let calls = 0
    const growing: StreamDurability = {
      ...log,
      snapshot: async () => {
        calls += 1
        if (calls <= 2) await log.append([chunk('quiet-2')])
        return log.snapshot()
      },
    }
    // Grows across the first two probes, then stops.
    expect(await awaitLogQuiescence(growing, 0)).toBe(2)
    expect(calls).toBeGreaterThanOrEqual(3)
  })

  it('gives up rather than looping forever on a log that never settles', async () => {
    const log = fakeLog()
    const never: StreamDurability = {
      ...log,
      snapshot: async () => {
        await log.append([chunk('quiet-3')])
        return log.snapshot()
      },
    }
    await expect(awaitLogQuiescence(never, 0)).rejects.toThrow(/never quiesced/)
  })

  it('uses snapshot, never read: a taken-over log is still open', async () => {
    const log = fakeLog([chunk('quiet-4')])
    const read = vi.fn(() => {
      throw new Error('read() would park forever on an open log')
    })
    const probed: StreamDurability = { ...log, read }
    expect(await awaitLogQuiescence(probed, 0)).toBe(1)
    expect(read).not.toHaveBeenCalled()
  })
})

describe('fenceDurability', () => {
  function claimWith(signal: AbortSignal, epoch = 1, runId = 'r1'): RunClaim {
    return { runId, epoch, signal }
  }

  it('passes appends through while the claim holds', async () => {
    const log = fakeLog()
    const runs = await runningRun('fence-1')
    await runs.update('fence-1', { driverEpoch: 1 })
    const fenced = fenceDurability(
      log,
      claimWith(new AbortController().signal, 1, 'fence-1'),
      { runs, epochRecheckAppends: 1 },
    )
    await fenced.append([chunk('fence-1')])
    expect(await storedCount(log)).toBe(1)
  })

  it('throws RunClaimLostError instead of appending once the lease signal aborts', async () => {
    const log = fakeLog()
    const controller = new AbortController()
    const runs = await runningRun('fence-2')
    const fenced = fenceDurability(
      log,
      claimWith(controller.signal, 1, 'fence-2'),
      { runs, epochRecheckAppends: 1 },
    )
    controller.abort()
    await expect(fenced.append([chunk('fence-2')])).rejects.toBeInstanceOf(
      RunClaimLostError,
    )
    // The decisive assertion: nothing landed. A fence that throws AFTER writing
    // is not a fence.
    expect(await storedCount(log)).toBe(0)
  })

  it('throws when the stored epoch has moved past the one held', async () => {
    const log = fakeLog()
    const runs = await runningRun('fence-3')
    await runs.update('fence-3', { driverEpoch: 4 })
    const fenced = fenceDurability(
      log,
      claimWith(new AbortController().signal, 3, 'fence-3'),
      { runs, epochRecheckAppends: 1 },
    )
    const lost = await fenced
      .append([chunk('fence-3')])
      .catch((error: unknown) => error)
    expect(lost).toBeInstanceOf(RunClaimLostError)
    if (lost instanceof RunClaimLostError) {
      expect(lost.heldEpoch).toBe(3)
      expect(lost.observedEpoch).toBe(4)
    }
    expect(await storedCount(log)).toBe(0)
  })

  it('re-reads the epoch at most once per epochRecheckAppends appends', async () => {
    const runs = await runningRun('fence-4')
    await runs.update('fence-4', { driverEpoch: 1 })
    const get = vi.spyOn(runs, 'get')
    const fenced = fenceDurability(
      fakeLog(),
      claimWith(new AbortController().signal, 1, 'fence-4'),
      { runs, epochRecheckAppends: 32 },
    )
    for (let i = 0; i < 3; i += 1) await fenced.append([chunk('fence-4')])
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('bounds a superseded driver to epochRecheckAppends appends regardless of rate', async () => {
    // The whole reason the re-check counts appends instead of elapsed time: a
    // hot stream cannot outrun the fence.
    const log = fakeLog()
    const runs = await runningRun('fence-5')
    await runs.update('fence-5', { driverEpoch: 1 })
    const fenced = fenceDurability(
      log,
      claimWith(new AbortController().signal, 1, 'fence-5'),
      { runs, epochRecheckAppends: 4 },
    )
    // First append re-reads (epoch still 1), then a successor claims.
    await fenced.append([chunk('fence-5')])
    await runs.update('fence-5', { driverEpoch: 2 })

    let landed = 1
    const failure = await (async () => {
      for (let i = 0; i < 100; i += 1) {
        await fenced.append([chunk('fence-5')])
        landed += 1
      }
      return null
    })().catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(RunClaimLostError)
    // 4 appends per re-read, so at most 4 land after the bump: the one that
    // re-read before it, plus 3 throttled ones.
    expect(landed).toBeLessThanOrEqual(4)
    expect(await storedCount(log)).toBe(landed)
  })

  it('treats an unreadable store as "still mine" rather than fencing itself out', async () => {
    // A store blip must not kill a healthy driver: the lease signal is the
    // primary fence and it has not fired.
    const log = fakeLog()
    const runs = await runningRun('fence-6')
    vi.spyOn(runs, 'get').mockRejectedValue(new Error('store down'))
    const fenced = fenceDurability(
      log,
      claimWith(new AbortController().signal, 1, 'fence-6'),
      { runs, epochRecheckAppends: 1 },
    )
    await fenced.append([chunk('fence-6')])
    expect(await storedCount(log)).toBe(1)
  })

  it('leaves resumeFrom, read, snapshot and close untouched', async () => {
    const close = vi.fn(() => Promise.resolve())
    const controller = new AbortController()
    controller.abort()
    const base: StreamDurability = { ...fakeLog(), close }
    const fenced = fenceDurability(base, claimWith(controller.signal), {
      runs: new InMemoryRunStore(),
    })
    // close() must NOT be fenced. It runs on the teardown path, including the
    // teardown caused by losing the claim, and a fenced close would wedge the
    // record at 'running' with live tailers parked forever. Same for the three
    // read-only methods — hence the already-aborted lease signal above.
    await fenced.close()
    expect(close).toHaveBeenCalledTimes(1)
    expect(fenced.resumeFrom()).toBeNull()
    expect(await fenced.snapshot()).toEqual([])
    expect(() => fenced.read('o:0')).not.toThrow()
  })
})

describe('fenceDurability — one refusal closes the fence for good', () => {
  function claimWith(
    signal: AbortSignal,
    epoch: number,
    runId: string,
  ): RunClaim {
    return { runId, epoch, signal }
  }

  it('refuses the append AFTER a refused one, and neither chunk lands', async () => {
    // The load-bearing case. Without the latch the refusal consumes the
    // epoch-recheck budget, so this second append rides a fresh throttle window
    // unchecked and lands on the SUCCESSOR's log. That is exactly how
    // `pipeToRunLog`'s recovery `RUN_ERROR` used to escape the fence.
    const log = fakeLog()
    const runs = await runningRun('latch-1')
    await runs.update('latch-1', { driverEpoch: 9 })
    const fenced = fenceDurability(
      log,
      claimWith(new AbortController().signal, 1, 'latch-1'),
      { runs, epochRecheckAppends: DEFAULT_EPOCH_RECHECK_APPENDS },
    )

    await expect(fenced.append([chunk('latch-1')])).rejects.toBeInstanceOf(
      RunClaimLostError,
    )
    await expect(fenced.append([chunk('latch-1')])).rejects.toBeInstanceOf(
      RunClaimLostError,
    )

    // Asserted through snapshot(): `fakeLog` copies its seed array, so checking
    // the array handed to it proves nothing.
    expect(await storedCount(log)).toBe(0)
  })

  it('replays the original refusal, so pipeToRunLog still sees RunClaimLostError', async () => {
    const runs = await runningRun('latch-2')
    await runs.update('latch-2', { driverEpoch: 5 })
    const fenced = fenceDurability(
      fakeLog(),
      claimWith(new AbortController().signal, 2, 'latch-2'),
      { runs, epochRecheckAppends: DEFAULT_EPOCH_RECHECK_APPENDS },
    )
    await fenced.append([chunk('latch-2')]).catch(() => undefined)

    const second = await fenced
      .append([chunk('latch-2')])
      .catch((error: unknown) => error)
    expect(second).toBeInstanceOf(RunClaimLostError)
    if (second instanceof RunClaimLostError) {
      expect(second.runId).toBe('latch-2')
      expect(second.heldEpoch).toBe(2)
      expect(second.observedEpoch).toBe(5)
    }
  })

  it('consults neither the throttle nor the store once latched', async () => {
    const runs = await runningRun('latch-3')
    await runs.update('latch-3', { driverEpoch: 4 })
    const fenced = fenceDurability(
      fakeLog(),
      claimWith(new AbortController().signal, 1, 'latch-3'),
      { runs, epochRecheckAppends: 1 },
    )
    await fenced.append([chunk('latch-3')]).catch(() => undefined)

    // A latched boolean is strictly cheaper than the store read it replaces.
    const get = vi.spyOn(runs, 'get')
    await fenced.append([chunk('latch-3')]).catch(() => undefined)
    await fenced.append([chunk('latch-3')]).catch(() => undefined)
    expect(get).not.toHaveBeenCalled()
  })

  it('latches on a LOST LEASE too, not only on a moved epoch', async () => {
    // `InMemoryLockStore` hands out a signal it never aborts, so it cannot
    // exercise this branch at all — hence a lock whose lease signal is a live
    // check that can flap, as a backend polling a lease clock under skew (or
    // re-acquiring the lease) can. The claim is gone regardless: the latch must
    // not let the fence re-open just because the signal stopped reporting it.
    const log = fakeLog()
    const runs = await runningRun('latch-4')
    await runs.update('latch-4', { driverEpoch: 1 })
    const lease = flappableLock()
    const fenced = await withRunClaim(
      { runs, locks: lease.locks, runId: 'latch-4', fenceQuietMs: 0 },
      (claim) =>
        Promise.resolve(
          fenceDurability(log, claim, {
            runs,
            epochRecheckAppends: DEFAULT_EPOCH_RECHECK_APPENDS,
          }),
        ),
    )

    lease.lose()
    const first = await fenced
      .append([chunk('latch-4')])
      .catch((error: unknown) => error)
    expect(first).toBeInstanceOf(RunClaimLostError)
    if (first instanceof RunClaimLostError) {
      expect(first.observedEpoch).toBe('lease-lost')
    }

    // The signal stops reporting the loss, and the stored epoch still matches
    // this claim — so ONLY the latch can refuse the next append.
    lease.regain()
    await expect(fenced.append([chunk('latch-4')])).rejects.toBeInstanceOf(
      RunClaimLostError,
    )
    expect(await storedCount(log)).toBe(0)
  })

  it('still appends normally across more than DEFAULT_EPOCH_RECHECK_APPENDS appends', async () => {
    // Proves the latch did not become "refuse eventually": a healthy claim must
    // cross throttle-window boundaries untouched, and the throttle must still
    // throttle.
    const log = fakeLog()
    const runs = await runningRun('latch-5')
    await runs.update('latch-5', { driverEpoch: 1 })
    const get = vi.spyOn(runs, 'get')
    const fenced = fenceDurability(
      log,
      claimWith(new AbortController().signal, 1, 'latch-5'),
      { runs },
    )

    const total = DEFAULT_EPOCH_RECHECK_APPENDS * 2 + 5
    for (let i = 0; i < total; i += 1) await fenced.append([chunk('latch-5')])

    expect(await storedCount(log)).toBe(total)
    // One read per window, not one per append and not zero.
    expect(get).toHaveBeenCalledTimes(
      Math.ceil(total / DEFAULT_EPOCH_RECHECK_APPENDS),
    )
  })

  it('still allows close() after the latch has tripped', async () => {
    // The latch must NOT extend to close(): it runs on the teardown caused by
    // losing the claim, and a refused close wedges the record at 'running' with
    // every live tailer parked forever.
    const close = vi.fn(() => Promise.resolve())
    const runs = await runningRun('latch-6')
    await runs.update('latch-6', { driverEpoch: 3 })
    const base: StreamDurability = { ...fakeLog(), close }
    const fenced = fenceDurability(
      base,
      claimWith(new AbortController().signal, 1, 'latch-6'),
      { runs, epochRecheckAppends: 1 },
    )

    await expect(fenced.append([chunk('latch-6')])).rejects.toBeInstanceOf(
      RunClaimLostError,
    )
    await expect(fenced.close()).resolves.toBeUndefined()
    expect(close).toHaveBeenCalledTimes(1)
  })
})

describe('the InMemoryLockStore configuration the epoch fence exists for', () => {
  it('gives the claim a signal that never aborts, so the lease fences nothing', async () => {
    const runs = await runningRun('mem-1')
    const locks = new InMemoryLockStore()
    const first = await withRunClaim({ runs, locks, runId: 'mem-1' }, (claim) =>
      Promise.resolve(claim),
    )
    // A second claim supersedes the first...
    await withRunClaim({ runs, locks, runId: 'mem-1' }, (claim) =>
      Promise.resolve(claim.epoch),
    )
    // ...and the first host's lease signal is STILL not aborted. This is the
    // documented `InMemoryLockStore` behavior, and it is precisely why layer 2
    // has to exist: on this backend layer 1 is inert.
    expect(first.signal.aborted).toBe(false)
  })

  it('fences the superseded driver by epoch even though its lease never aborted', async () => {
    const runs = await runningRun('mem-2')
    const locks = new InMemoryLockStore()
    const log = fakeLog()

    // Host A claims and builds its fenced log.
    const hostA = await withRunClaim({ runs, locks, runId: 'mem-2' }, (claim) =>
      Promise.resolve(
        fenceDurability(log, claim, { runs, epochRecheckAppends: 1 }),
      ),
    )
    const hostBClaim = await withRunClaim(
      { runs, locks, runId: 'mem-2' },
      (claim) => Promise.resolve(claim),
    )
    expect(hostBClaim.epoch).toBe(2)

    // Host A is now superseded. Its lease signal never fired, so the ONLY thing
    // that can stop it writing is the epoch re-check.
    expect(hostBClaim.signal.aborted).toBe(false)
    await expect(hostA.append([chunk('mem-2')])).rejects.toBeInstanceOf(
      RunClaimLostError,
    )
    expect(await storedCount(log)).toBe(0)

    // And the successor's own fenced log still writes.
    const hostB = fenceDurability(log, hostBClaim, {
      runs,
      epochRecheckAppends: 1,
    })
    await hostB.append([chunk('mem-2')])
    expect(await storedCount(log)).toBe(1)
  })

  it('serializes two claims racing on one runId and hands out monotonic epochs', async () => {
    const runs = await runningRun('mem-3')
    const locks = new InMemoryLockStore()
    let concurrent = 0
    let maxConcurrent = 0

    const drive = (): Promise<number> =>
      withRunClaim({ runs, locks, runId: 'mem-3' }, async (claim) => {
        concurrent += 1
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await Promise.resolve()
        concurrent -= 1
        return claim.epoch
      })

    const epochs = await Promise.all([drive(), drive()])

    expect(maxConcurrent).toBe(1)
    expect([...epochs].sort((a, b) => a - b)).toEqual([1, 2])
    expect((await runs.get('mem-3'))?.driverEpoch).toBe(2)
  })

  it('fences a driver superseded mid-drive, after it has already appended', async () => {
    const runs = await runningRun('mem-4')
    const log = fakeLog()
    // A lease-backed lock in another process would hold its own key; model the
    // successor as a bare store write, which is all the loser can observe.
    const fenced = await withRunClaim(
      { runs, locks: new InMemoryLockStore(), runId: 'mem-4' },
      (claim) =>
        Promise.resolve(
          fenceDurability(log, claim, { runs, epochRecheckAppends: 1 }),
        ),
    )

    await fenced.append([chunk('mem-4')])
    await fenced.append([chunk('mem-4')])
    expect(await storedCount(log)).toBe(2)

    await runs.update('mem-4', { driverEpoch: 2 })

    await expect(fenced.append([chunk('mem-4')])).rejects.toBeInstanceOf(
      RunClaimLostError,
    )
    // The two pre-supersession appends stand; the third never landed.
    expect(await storedCount(log)).toBe(2)
  })
})
