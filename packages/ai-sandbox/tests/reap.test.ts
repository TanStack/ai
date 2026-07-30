/**
 * WHAT THESE TESTS ARE GUARDING, because the obvious test suite for a reaper is
 * vacuous in two specific ways this project has already been burned by:
 *
 * 1. **A sweep over an EMPTY list satisfies every "did not act" assertion.**
 *    `expect(closes).toBe(0)` passes when the reaper never saw the run at all.
 *    Every test below therefore constructs BOTH a run the reaper must act on AND
 *    a run it must leave alone, in the SAME sweep, and asserts both halves.
 * 2. **`expect(DEFAULT_MAX_RUNS).toBe(25)` is tautological.** The behaviour worth
 *    pinning is that OMITTING `maxRuns` caps the batch, so that is what is
 *    asserted — against the exported constant, never against a literal.
 *
 * There are also no elapsed-time assertions anywhere here. A `Date.now()` delta
 * bound is a flake on a loaded CI box and proves nothing about the mechanism; the
 * budget is pinned by its OUTCOME (`'budget-exceeded'`), not by a stopwatch.
 *
 * `memoryStream`/`fakeLog` key their state by runId, and this file's runIds are
 * unique per case (`rp-<uuid>`) so no two cases can share a log.
 */
import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { EventType, InMemoryRunStore } from '@tanstack/ai'
import { InMemoryLockStore } from '@tanstack/ai/locks'
import { captureLogger, fakeLog, makeFakeHandle } from './fakes'
import {
  DEFAULT_MAX_RUNS,
  DEFAULT_RUN_BUDGET_MS,
  probeRunExit,
  reapDetachedRuns,
} from '../src/reap'
import { exitSentinelLine, journalPaths } from '../src/journal'
import { isTerminalRunStatus } from '@tanstack/ai'
import type { ReapOptions, RunExitProbe } from '../src/reap'
import type { LockStore } from '@tanstack/ai/locks'
import type {
  RunRecord,
  RunStatus,
  StreamChunk,
  StreamDurability,
} from '@tanstack/ai'

const NOW = 1_700_000_000_000
const TTL = 30 * 60_000

function textChunk(runId: string): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: `${runId}-m`,
    delta: 'hello',
    timestamp: 1,
  }
}

/**
 * A `fakeLog` that records the two things the `'producing'` path must never do —
 * append and `close()` — plus, optionally, a snapshot that NEVER stops growing so
 * `awaitLogQuiescence` has something real to refuse.
 */
interface TrackedLog {
  log: StreamDurability
  readonly appended: Array<StreamChunk>
  readonly closes: number
}

function trackedLog(options: { growing?: boolean } = {}): TrackedLog {
  const inner = fakeLog()
  const appended: Array<StreamChunk> = []
  const state = { closes: 0, growth: 0 }
  const log: StreamDurability = {
    resumeFrom: () => inner.resumeFrom(),
    append: (chunks) => {
      appended.push(...chunks)
      return inner.append(chunks)
    },
    read: (offset, signal) => inner.read(offset, signal),
    close: () => {
      state.closes += 1
      return inner.close()
    },
    snapshot: () => {
      if (options.growing !== true) return inner.snapshot()
      // A predecessor still writing: every probe sees more entries than the last.
      state.growth += 1
      return Promise.resolve(
        Array.from({ length: state.growth }, (_unused, index) => ({
          offset: `o:${index}`,
          chunk: textChunk('growing'),
        })),
      )
    },
  }
  return {
    log,
    appended,
    get closes() {
      return state.closes
    },
  }
}

/** A `LockStore` that hands out a caller-chosen signal per lock key. */
function lockStoreWith(signalFor: (key: string) => AbortSignal): LockStore {
  return { withLock: (key, fn) => fn(signalFor(key)) }
}

interface Harness {
  runs: InMemoryRunStore
  /** Log for one run; created on first touch so assertions can precede the sweep. */
  logOf: (runId: string) => TrackedLog
  /** Make one run's log never quiesce. */
  makeLogGrow: (runId: string) => void
  /** Interleaved `cancel:<runId>` / `drive:<runId>` events, in the order they happened. */
  order: Array<string>
  driven: Array<string>
  /** Signal each `drive` call was handed, so lease linkage is directly observable. */
  driveSignals: Map<string, AbortSignal>
  probedRuns: Array<string>
  reclaimed: Array<RunRecord>
  /** Store writes the SWEEP made; the fixture's own seeding is excluded. */
  updatesOf: (runId: string) => Array<Partial<RunRecord>>
  /** Make the terminal `update` for one run reject, as a flaky store would. */
  failTerminalWritesFor: (runId: string) => void
  /** Seed a detached, running run and answer the record as `listReclaimable` would. */
  seed: (input: {
    detachedSince: number
    sandboxKey?: string
    status?: RunStatus
  }) => Promise<RunRecord>
  /** Per-run probe answer; defaults to `{ state: 'producing' }`. */
  probes: Map<string, RunExitProbe | (() => Promise<RunExitProbe>)>
  options: (overrides?: Partial<ReapOptions>) => ReapOptions
}

function makeHarness(): Harness {
  const runs = new InMemoryRunStore()
  const logs = new Map<string, TrackedLog>()
  const growing = new Set<string>()
  const order: Array<string> = []
  const driven: Array<string> = []
  const driveSignals = new Map<string, AbortSignal>()
  const probedRuns: Array<string> = []
  const reclaimed: Array<RunRecord> = []
  const updates: Array<{ runId: string; patch: Partial<RunRecord> }> = []
  const failTerminal = new Set<string>()
  const probes = new Map<string, RunExitProbe | (() => Promise<RunExitProbe>)>()

  const logOf = (runId: string): TrackedLog => {
    const existing = logs.get(runId)
    if (existing !== undefined) return existing
    const fresh = trackedLog(growing.has(runId) ? { growing: true } : {})
    logs.set(runId, fresh)
    return fresh
  }

  // Observe every write while keeping the store's real behaviour, so an
  // assertion about what was written is checking the store, not a stub.
  const realUpdate = runs.update.bind(runs)
  vi.spyOn(runs, 'update').mockImplementation(async (runId, patch) => {
    updates.push({ runId, patch })
    if (patch.cancelRequested === true) order.push(`cancel:${runId}`)
    if (failTerminal.has(runId) && patch.status !== undefined) {
      throw new Error('terminal write failed')
    }
    await realUpdate(runId, patch)
  })

  const drive: ReapOptions['drive'] = (input) => {
    order.push(`drive:${input.runId}`)
    driven.push(input.runId)
    driveSignals.set(input.runId, input.signal)
    return (async function* twoChunks() {
      for (const chunk of [textChunk(input.runId), textChunk(input.runId)]) {
        if (input.signal.aborted) return
        yield chunk
      }
    })()
  }

  const hasFinished: ReapOptions['hasFinished'] = async (record) => {
    probedRuns.push(record.runId)
    const answer = probes.get(record.runId) ?? { state: 'producing' as const }
    return typeof answer === 'function' ? answer() : answer
  }

  return {
    runs,
    logOf,
    makeLogGrow: (runId) => void growing.add(runId),
    order,
    driven,
    driveSignals,
    probedRuns,
    reclaimed,
    updatesOf: (runId) =>
      updates.filter((entry) => entry.runId === runId).map((e) => e.patch),
    failTerminalWritesFor: (runId) => void failTerminal.add(runId),
    probes,
    seed: async (input) => {
      const runId = `rp-${randomUUID()}`
      await runs.createOrResume({
        runId,
        threadId: `th-${runId}`,
        startedAt: NOW - TTL * 4,
      })
      // Seeding goes STRAIGHT to the store, bypassing the observer, so
      // `updatesOf` reports only what the sweep itself wrote.
      await realUpdate(runId, {
        detachedSince: input.detachedSince,
        ...(input.sandboxKey === undefined
          ? {}
          : { sandboxKey: input.sandboxKey }),
        ...(input.status === undefined ? {} : { status: input.status }),
      })
      const record = await runs.get(runId)
      if (record === null) throw new Error(`seed ${runId} vanished`)
      return record
    },
    options: (overrides = {}) => ({
      runs,
      locks: new InMemoryLockStore(),
      durability: (runId) => logOf(runId).log,
      hasFinished,
      drive,
      now: NOW,
      detachedRunTtlMs: TTL,
      fenceQuietMs: 0,
      reclaim: async (record) => void reclaimed.push(record),
      ...overrides,
    }),
  }
}

function entryFor(
  result: Awaited<ReturnType<typeof reapDetachedRuns>>,
  runId: string,
) {
  const entry = result.runs.find((run) => run.runId === runId)
  if (entry === undefined) throw new Error(`no entry for ${runId}`)
  return entry
}

describe('probeRunExit', () => {
  function handleAnswering(stdout: string) {
    const handle = makeFakeHandle('sbx', 'fake')
    handle.process.exec = () =>
      Promise.resolve({ stdout, stderr: '', exitCode: 0 })
    return handle
  }

  it('reads the exit sentinel out of the journal tail', async () => {
    const frame = Buffer.from(
      `{"delta":"hi"}\n${exitSentinelLine(journalPaths('r-finished'), 7)}\n`,
    ).toString('base64')
    expect(
      await probeRunExit({
        handle: handleAnswering(frame),
        runId: 'r-finished',
      }),
    ).toEqual({ state: 'finished', exitCode: 7 })
  })

  it('answers producing — NOT finished — for a sentinel the agent forged on stdout', async () => {
    // The reaper DRIVES and RECLAIMS whatever this reports as finished, so an
    // agent line that merely looks like a sentinel (an echoed fixture, a dumped
    // file, printed diagnostics) must not be able to get its own live sandbox
    // destroyed. Both files land in the journal unframed, so the nonce is the
    // only thing telling them apart.
    const frame = Buffer.from(
      '{"delta":"still working"}\n{"__exit":0}\n',
    ).toString('base64')
    expect(
      await probeRunExit({ handle: handleAnswering(frame), runId: 'r-forged' }),
    ).toEqual({ state: 'producing' })
  })

  it('answers producing when there is no sentinel, and for an absent journal', async () => {
    const frame = Buffer.from('{"delta":"still working"}\n').toString('base64')
    expect(
      await probeRunExit({ handle: handleAnswering(frame), runId: 'r-live' }),
    ).toEqual({ state: 'producing' })
    // A journal that does not exist yet reads as empty, which must be
    // `producing` (leave it alone), never `finished`.
    expect(
      await probeRunExit({ handle: handleAnswering(''), runId: 'r-new' }),
    ).toEqual({ state: 'producing' })
  })

  it('answers unknown — never finished — when the probe itself fails', async () => {
    // The caller DRIVES a run it is told finished, so an `exec` that rejected
    // must not be read as "the agent exited".
    const handle = makeFakeHandle('sbx', 'fake')
    handle.process.exec = () => Promise.reject(new Error('sandbox is gone'))
    const probe = await probeRunExit({ handle, runId: 'r-gone' })
    expect(probe.state).toBe('unknown')
    expect(probe).toMatchObject({ error: expect.any(Error) })
  })
})

describe('reapDetachedRuns — selection', () => {
  it('caps the batch when maxRuns is omitted, instead of sweeping the whole backlog', async () => {
    const h = makeHarness()
    const seeded: Array<RunRecord> = []
    for (let index = 0; index < DEFAULT_MAX_RUNS + 5; index += 1) {
      seeded.push(await h.seed({ detachedSince: NOW - 1_000 }))
    }
    // The store really does surface more than the cap, so the cap is what bounds
    // the batch rather than the fixture being small.
    expect((await h.runs.listReclaimable({ now: NOW, ttlMs: 0 })).length).toBe(
      seeded.length,
    )

    const result = await reapDetachedRuns(h.options())
    expect(result.considered).toBe(DEFAULT_MAX_RUNS)
    expect(result.runs).toHaveLength(DEFAULT_MAX_RUNS)
    // The tail of the backlog was not probed either — the cap is applied before
    // any per-run work, not after it.
    expect(result.probed).toBe(DEFAULT_MAX_RUNS)
    expect(h.probedRuns).toHaveLength(DEFAULT_MAX_RUNS)
  })

  it('expires a run detached at EXACTLY the cutoff and leaves one a millisecond fresher alone', async () => {
    // `RunStore.listReclaimable` documents its cutoff as INCLUSIVE. If this
    // module disagreed, a run would be listed as reclaimable and then classified
    // as fresh on every sweep, forever.
    const h = makeHarness()
    const onCutoff = await h.seed({ detachedSince: NOW - TTL })
    const fresher = await h.seed({ detachedSince: NOW - TTL + 1 })

    const result = await reapDetachedRuns(h.options())

    expect(entryFor(result, onCutoff.runId).outcome).toBe('expired')
    expect(entryFor(result, fresher.runId).outcome).toBe('producing')
    // An expired run needs no probe: its outcome is terminal either way.
    expect(h.probedRuns).toEqual([fresher.runId])
    expect(result.probed).toBe(1)
    expect(h.driven).toEqual([onCutoff.runId])
  })

  it('returns considered 0 and logs when the store cannot list reclaimable runs', async () => {
    const { logger, calls } = captureLogger()
    const runs = new InMemoryRunStore()
    // A backend that omits the optional method entirely.
    const withoutList: ReapOptions['runs'] = {
      createOrResume: (input) => runs.createOrResume(input),
      get: (runId) => runs.get(runId),
      update: (runId, patch) => runs.update(runId, patch),
    }
    const h = makeHarness()
    const result = await reapDetachedRuns(
      h.options({ runs: withoutList, logger }),
    )
    expect(result).toMatchObject({ considered: 0, probed: 0, runs: [] })
    expect(result.outcomes.failed).toBe(0)
    expect(calls.some((call) => call.msg.includes('listReclaimable'))).toBe(
      true,
    )
  })

  it('folds a listing failure into an empty sweep instead of rejecting', async () => {
    const h = makeHarness()
    const { logger, calls } = captureLogger()
    vi.spyOn(h.runs, 'listReclaimable').mockRejectedValue(
      new Error('store down'),
    )
    await expect(
      reapDetachedRuns(h.options({ logger })),
    ).resolves.toMatchObject({
      considered: 0,
    })
    expect(calls.some((call) => call.level === 'error')).toBe(true)
  })
})

describe('reapDetachedRuns — the leave-alone path', () => {
  it("a 'producing' run is not driven, not appended to, not closed, and not touched in the store", async () => {
    // THE DEFECT THIS WHOLE MODULE EXISTS TO PREVENT. Entering `pipeToRunLog` to
    // "check" would record a healthy mid-flight run as `'completed'`, close a log
    // that must stay open for takeover, and drop the run out of
    // `listReclaimable` forever — so its sandbox could never be reclaimed.
    const h = makeHarness()
    const live = await h.seed({ detachedSince: NOW - 60_000 })
    const done = await h.seed({
      detachedSince: NOW - 60_000,
      sandboxKey: 'k-done',
    })
    h.probes.set(live.runId, { state: 'producing' })
    h.probes.set(done.runId, { state: 'finished', exitCode: 0 })

    const result = await reapDetachedRuns(h.options())

    expect(entryFor(result, live.runId).outcome).toBe('producing')
    expect(h.driven).not.toContain(live.runId)
    expect(h.logOf(live.runId).appended).toEqual([])
    expect(h.logOf(live.runId).closes).toBe(0)
    // Not even `driverEpoch` moved: the claim was never taken.
    expect(h.updatesOf(live.runId)).toEqual([])
    const after = await h.runs.get(live.runId)
    expect(after).toMatchObject({ status: 'running' })
    // `detachedSince` is the field the NEXT sweep selects on and this run's only
    // TTL evidence. Clearing it (what `startRunDriver` correctly does for a real
    // viewer) would mean a detached run never expires.
    expect(after?.detachedSince).toBe(NOW - 60_000)

    // ...and the reaper still did its job on the run that HAD finished, so none
    // of the assertions above are passing merely because the sweep was empty.
    expect(entryFor(result, done.runId).outcome).toBe('finalized')
    expect(h.driven).toEqual([done.runId])
    expect(h.logOf(done.runId).appended).toHaveLength(2)
    expect(h.logOf(done.runId).closes).toBe(1)
  })

  it("an 'unknown' probe leaves the run alone and carries the error", async () => {
    const h = makeHarness()
    const opaque = await h.seed({ detachedSince: NOW - 60_000 })
    const done = await h.seed({ detachedSince: NOW - 60_000 })
    h.probes.set(opaque.runId, {
      state: 'unknown',
      error: new Error('no handle'),
    })
    h.probes.set(done.runId, { state: 'finished', exitCode: 0 })

    const result = await reapDetachedRuns(h.options())

    const entry = entryFor(result, opaque.runId)
    expect(entry.outcome).toBe('unknown')
    expect(entry.error).toBeInstanceOf(Error)
    expect(h.driven).toEqual([done.runId])
    expect(h.logOf(opaque.runId).closes).toBe(0)
    expect(result.outcomes).toMatchObject({ unknown: 1, finalized: 1 })
  })
})

describe('reapDetachedRuns — finalizing a finished run', () => {
  it('drives it to terminal, saves the transcript, and reclaims the sandbox', async () => {
    const h = makeHarness()
    const done = await h.seed({
      detachedSince: NOW - 60_000,
      sandboxKey: 'k-1',
    })
    const live = await h.seed({
      detachedSince: NOW - 60_000,
      sandboxKey: 'k-2',
    })
    h.probes.set(done.runId, { state: 'finished', exitCode: 3 })

    const result = await reapDetachedRuns(h.options())

    expect(entryFor(result, done.runId)).toMatchObject({
      outcome: 'finalized',
      status: 'completed',
      exitCode: 3,
    })
    expect(h.logOf(done.runId).appended).toHaveLength(2)
    expect(h.logOf(done.runId).closes).toBe(1)
    expect((await h.runs.get(done.runId))?.status).toBe('completed')
    // Only the finished run's sandbox — the live one must keep running.
    expect(h.reclaimed.map((record) => record.runId)).toEqual([done.runId])
    expect(entryFor(result, live.runId).outcome).toBe('producing')
  })

  it('hands reclaim the ORIGINALLY LISTED record, so a failed terminal write cannot lose the sandboxKey', async () => {
    // `finish`'s degraded path returns a locally REBUILT record carrying only
    // runId/threadId/startedAt plus the terminal patch — no `sandboxKey`. Feeding
    // that to `reclaimSandbox` yields `'no-sandbox-key'` and the sandbox leaks
    // silently, on exactly the path where something already went wrong.
    const h = makeHarness()
    const done = await h.seed({
      detachedSince: NOW - 60_000,
      sandboxKey: 'k-keep',
    })
    h.probes.set(done.runId, { state: 'finished', exitCode: 0 })
    h.failTerminalWritesFor(done.runId)

    const result = await reapDetachedRuns(h.options())

    expect(entryFor(result, done.runId).outcome).toBe('finalized')
    expect(h.reclaimed).toHaveLength(1)
    expect(h.reclaimed[0]?.sandboxKey).toBe('k-keep')
  })
})

describe('reapDetachedRuns — expiring a run past its TTL', () => {
  it('records the cancel BEFORE the drive, so teardown destroys instead of re-detaching', async () => {
    // `withSandbox`'s `onAbort` resolves the out-of-band cancel band FROM the
    // record. Recorded after the drive, the teardown has already happened as a
    // second detach: `detachedSince` is re-armed and the run is swept forever.
    const h = makeHarness()
    const expired = await h.seed({ detachedSince: NOW - TTL - 1 })
    const fresh = await h.seed({ detachedSince: NOW - 1_000 })

    const result = await reapDetachedRuns(h.options())

    expect(h.order.indexOf(`cancel:${expired.runId}`)).toBeGreaterThanOrEqual(0)
    expect(h.order.indexOf(`cancel:${expired.runId}`)).toBeLessThan(
      h.order.indexOf(`drive:${expired.runId}`),
    )
    expect((await h.runs.get(expired.runId))?.cancelRequested).toBe(true)
    expect(entryFor(result, expired.runId).outcome).toBe('expired')
    // A run inside its TTL is neither cancelled nor driven.
    expect(h.order).not.toContain(`cancel:${fresh.runId}`)
    expect(h.driven).not.toContain(fresh.runId)
    expect(entryFor(result, fresh.runId).outcome).toBe('producing')
  })

  it('reports expired — not the budget anomaly — when the budget stops a STILL-PRODUCING agent', async () => {
    // The realistic expiry: the agent is mid-sentence, and nothing polls the
    // cancel recorded a moment ago (`wasCancelRequested`'s only reader is
    // `withSandbox`'s `onAbort`, which runs after something else has aborted), so
    // `runBudgetMs` is what ends this drive. That is the DESIGNED stop on this
    // path, so labelling it `'budget-exceeded'` — which `reap.ts` defines as the
    // journal read, translation, or log misbehaving — made `'expired'` unreachable
    // for exactly the runs the TTL exists to expire.
    const h = makeHarness()
    const expired = await h.seed({ detachedSince: NOW - TTL - 1 })
    const wedged = await h.seed({ detachedSince: NOW - 60_000 })
    // Not expired, probe says finished: the budget IS the anomaly here.
    h.probes.set(wedged.runId, { state: 'finished', exitCode: 0 })
    const drive: ReapOptions['drive'] = (input) => {
      h.driven.push(input.runId)
      return (async function* forever() {
        while (!input.signal.aborted) {
          yield textChunk(input.runId)
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
      })()
    }

    const result = await reapDetachedRuns(h.options({ drive, runBudgetMs: 1 }))

    const entry = entryFor(result, expired.runId)
    expect(entry.outcome).toBe('expired')
    // The exact status, not merely "terminal": a run the reaper force-expired
    // while its agent was still producing did NOT complete. `'completed'` here is
    // a false transcript for a run whose sandbox is about to be destroyed.
    expect(entry.status).toBe('aborted')
    expect((await h.runs.get(expired.runId))?.status).toBe('aborted')
    expect(entry.terminalizedAnyway).toBeUndefined()
    // Terminal, so the sandbox is still reclaimed — the cost leak stays closed.
    expect(h.reclaimed.map((record) => record.runId)).toContain(expired.runId)
    // The anomaly is still reported where it IS one: the finalization path.
    expect(entryFor(result, wedged.runId).outcome).toBe('budget-exceeded')
  })
})

describe('reapDetachedRuns — claiming and quiescence', () => {
  it('refuses to append into a log that never quiesces, and keeps sweeping', async () => {
    // The successor's first append must come after the stored log has stopped
    // growing, so a predecessor still writing is OBSERVED rather than raced.
    const h = makeHarness()
    const noisy = await h.seed({ detachedSince: NOW - 60_000 })
    const quiet = await h.seed({ detachedSince: NOW - 60_000 })
    h.makeLogGrow(noisy.runId)
    h.probes.set(noisy.runId, { state: 'finished', exitCode: 0 })
    h.probes.set(quiet.runId, { state: 'finished', exitCode: 0 })

    const result = await reapDetachedRuns(h.options())

    expect(entryFor(result, noisy.runId).outcome).toBe('failed')
    expect(h.driven).toEqual([quiet.runId])
    expect(h.logOf(noisy.runId).appended).toEqual([])
    expect(entryFor(result, quiet.runId).outcome).toBe('finalized')
  })

  it('reports not-claimed when another host already terminalized the run, without writing a cancel onto it', async () => {
    const h = makeHarness()
    const raced = await h.seed({
      detachedSince: NOW - TTL - 1,
      status: 'completed',
    })
    const mine = await h.seed({ detachedSince: NOW - 60_000 })
    h.probes.set(mine.runId, { state: 'finished', exitCode: 0 })
    // `listReclaimable` cannot return a terminal run, so the race is staged: the
    // record moved to terminal between the listing and the claim.
    vi.spyOn(h.runs, 'listReclaimable').mockResolvedValue([raced, mine])

    const result = await reapDetachedRuns(h.options())

    expect(entryFor(result, raced.runId).outcome).toBe('not-claimed')
    expect(h.driven).toEqual([mine.runId])
    expect(h.reclaimed.map((record) => record.runId)).toEqual([mine.runId])
    // The cancel is recorded INSIDE the claim, so a refused claim writes
    // NOTHING. Recorded before the claim it landed on an already-terminal
    // record — harmless here only by luck, and the same write on a run whose
    // viewer had returned is the poisoning case the next test covers.
    expect(h.updatesOf(raced.runId)).toEqual([])
    expect((await h.runs.get(raced.runId))?.cancelRequested).toBeUndefined()
  })

  it('never cancels a run whose viewer came back between the listing and the claim', async () => {
    // `expired` derived from the LISTED record is stale by the time the claim is
    // held. `startRunDriver` clears `detachedSince` when a real viewer attaches,
    // deliberately stopping the TTL clock; it takes the same per-run lock, so
    // the clear lands while this sweep is queued behind it.
    //
    // Nothing anywhere in the tree clears `cancelRequested`, so writing it on a
    // now-live run is PERMANENT — and the claim is then refused, which
    // `'not-claimed'` documents as normal, so the poisoning write is invisible.
    // On that viewer's next ordinary disconnect `middleware.ts`'s
    // `wasCancelRequested` read skips the detach branch and destroys the sandbox
    // of a healthy, actively-viewed run.
    const h = makeHarness()
    const returning = await h.seed({
      detachedSince: NOW - TTL - 1,
      sandboxKey: 'k-back',
    })
    const done = await h.seed({ detachedSince: NOW - 60_000 })
    h.probes.set(done.runId, { state: 'finished', exitCode: 0 })
    let viewerReturned = false
    const locks = lockStoreWith((key) => {
      if (key.includes(returning.runId)) viewerReturned = true
      return new AbortController().signal
    })
    // Applied through the store the sweep itself reads, so the re-read under the
    // lock is the only thing that can notice.
    const realGet = h.runs.get.bind(h.runs)
    vi.spyOn(h.runs, 'get').mockImplementation(async (runId) => {
      if (viewerReturned && runId === returning.runId) {
        viewerReturned = false
        await h.runs.update(runId, { detachedSince: undefined })
      }
      return realGet(runId)
    })

    const result = await reapDetachedRuns(h.options({ locks }))

    expect((await h.runs.get(returning.runId))?.cancelRequested).toBeUndefined()
    expect(h.order).not.toContain(`cancel:${returning.runId}`)
    expect(h.driven).not.toContain(returning.runId)
    expect(h.logOf(returning.runId).appended).toEqual([])
    expect(h.logOf(returning.runId).closes).toBe(0)
    expect(entryFor(result, returning.runId).outcome).toBe('not-claimed')
    expect((await h.runs.get(returning.runId))?.status).toBe('running')
    // The sandbox of the run the viewer is watching stays up.
    expect(h.reclaimed.map((record) => record.runId)).toEqual([done.runId])
    // ...and the genuinely finished run in the SAME sweep still went through, so
    // none of the above passes merely because nothing was swept.
    expect(entryFor(result, done.runId).outcome).toBe('finalized')
  })

  it('arms the run budget only after the lock and quiescence, so a queued claim cannot discard a finished transcript', async () => {
    // The budget must bound the DRIVE, not the queue. Armed before
    // `locks.withLock` and `awaitLogQuiescence` — both of which consume it — the
    // effective budget was `runBudgetMs − fenceQuietMs − lockWait`. Another host
    // holding the lock for longer than the budget meant the claim was acquired
    // with the timer ALREADY fired, `pipeToRunLog` hit its entry `signal.aborted`
    // check before pulling one chunk, and a FINISHED agent's transcript was
    // recorded `'aborted'` with the log closed — unreplayable forever, since a
    // terminal record drops out of `listReclaimable`, and then its sandbox was
    // destroyed while holding the only copy.
    const h = makeHarness()
    const queued = await h.seed({
      detachedSince: NOW - 60_000,
      sandboxKey: 'k-queued',
    })
    const live = await h.seed({ detachedSince: NOW - 60_000 })
    h.probes.set(queued.runId, { state: 'finished', exitCode: 0 })
    // Both consumers at once, each on its own longer than the whole budget: a
    // predecessor holding the lock, and the quiescence window.
    const locks: LockStore = {
      withLock: async (_key, fn) => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return fn(new AbortController().signal)
      },
    }

    const result = await reapDetachedRuns(
      h.options({ locks, runBudgetMs: 50, fenceQuietMs: 25 }),
    )

    const entry = entryFor(result, queued.runId)
    expect(entry.outcome).toBe('finalized')
    expect(entry.status).toBe('completed')
    expect(h.logOf(queued.runId).appended).toHaveLength(2)
    expect(result.outcomes['budget-exceeded']).toBe(0)
    expect(h.reclaimed.map((record) => record.runId)).toEqual([queued.runId])
    // The leave-alone half of the same sweep, so the assertions above are not
    // passing because nothing was considered.
    expect(entryFor(result, live.runId).outcome).toBe('producing')
  })

  it('links the drive to the claim lease, suppresses the terminal write, and reclaims nothing', async () => {
    // A lost lease means a SUCCESSOR is appending to this same log. The drive must
    // stop (or every chunk doubles), the terminal record must be suppressed (or a
    // live run reads `'failed'`), and the sandbox must NOT be torn down under the
    // successor that is still using it.
    const h = makeHarness()
    const lost = await h.seed({
      detachedSince: NOW - 60_000,
      sandboxKey: 'k-lost',
    })
    const held = await h.seed({
      detachedSince: NOW - 60_000,
      sandboxKey: 'k-held',
    })
    h.probes.set(lost.runId, { state: 'finished', exitCode: 0 })
    h.probes.set(held.runId, { state: 'finished', exitCode: 0 })
    const dead = new AbortController()
    dead.abort()
    const locks = lockStoreWith((key) =>
      key.includes(lost.runId) ? dead.signal : new AbortController().signal,
    )

    const result = await reapDetachedRuns(h.options({ locks }))

    // The signal the drive was handed is the lease's, not merely the budget's.
    expect(h.driveSignals.get(lost.runId)?.aborted).toBe(true)
    expect(h.logOf(lost.runId).appended).toEqual([])
    expect(entryFor(result, lost.runId).outcome).toBe('not-claimed')
    expect((await h.runs.get(lost.runId))?.status).toBe('running')
    expect(h.reclaimed.map((record) => record.runId)).toEqual([held.runId])

    // The run whose lease was healthy went all the way through.
    expect(h.driveSignals.get(held.runId)?.aborted).toBe(false)
    expect(entryFor(result, held.runId).outcome).toBe('finalized')
  })
})

describe('reapDetachedRuns — totality', () => {
  it('never rejects: a throwing probe is recorded against its run and the sweep continues', async () => {
    const h = makeHarness()
    const { logger, calls } = captureLogger()
    const broken = await h.seed({ detachedSince: NOW - 60_000 })
    const done = await h.seed({ detachedSince: NOW - 60_000 })
    h.probes.set(broken.runId, () =>
      Promise.reject(new Error('probe exploded')),
    )
    h.probes.set(done.runId, { state: 'finished', exitCode: 0 })

    // It runs from a cron with nobody to catch it, so a rejection would be an
    // unhandled rejection AND would abandon every run after the bad one.
    const result = await reapDetachedRuns(h.options({ logger }))

    expect(entryFor(result, broken.runId)).toMatchObject({ outcome: 'failed' })
    expect(entryFor(result, broken.runId).error).toBeInstanceOf(Error)
    expect(entryFor(result, done.runId).outcome).toBe('finalized')
    expect(h.driven).toEqual([done.runId])
    expect(result.outcomes).toMatchObject({ failed: 1, finalized: 1 })
    expect(calls.some((call) => call.level === 'error')).toBe(true)
  })

  it('reports budget-exceeded as an anomaly, with the record still terminal and the log closed', async () => {
    // The budget is a SAFETY NET on a run the journal already said was finished,
    // not the mechanism that decides whether it finished. Its expiry is therefore
    // a diagnostic — and `pipeToRunLog` still terminalizes, so nothing leaks.
    const h = makeHarness()
    const wedged = await h.seed({ detachedSince: NOW - 60_000 })
    const normal = await h.seed({ detachedSince: NOW - 60_000 })
    h.probes.set(wedged.runId, { state: 'finished', exitCode: 0 })
    h.probes.set(normal.runId, { state: 'finished', exitCode: 0 })
    const drive: ReapOptions['drive'] = (input) => {
      h.driven.push(input.runId)
      if (input.runId !== wedged.runId) {
        return (async function* one() {
          yield textChunk(input.runId)
        })()
      }
      return (async function* forever() {
        while (!input.signal.aborted) {
          yield textChunk(input.runId)
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
      })()
    }

    const result = await reapDetachedRuns(h.options({ drive, runBudgetMs: 1 }))

    const entry = entryFor(result, wedged.runId)
    expect(entry.outcome).toBe('budget-exceeded')
    expect(entry.terminalizedAnyway).toBe(true)
    expect(isTerminalRunStatus(entry.status ?? 'running')).toBe(true)
    expect(h.logOf(wedged.runId).closes).toBe(1)
    // A run inside the budget is unaffected; the budget is per-run, not per-sweep.
    expect(entryFor(result, normal.runId).outcome).toBe('finalized')
    expect(entryFor(result, normal.runId).terminalizedAnyway).toBeUndefined()
  })

  it('reports a failed reclaim distinctly from a failed sweep, with the transcript still saved', async () => {
    // `reclaimSandbox` deliberately does not guard `instances.get` (the caller is
    // meant to record it) and neither does `sandboxReclaimer`, so a throwing
    // instance store landed in the outer catch as a bare `'failed'` with no
    // `status` and no `exitCode`. By then the record is terminal and the log
    // closed, so the run is out of `listReclaimable` FOREVER: the sandbox leaks
    // with no retry, attributed to a generic sweep failure an operator cannot
    // tell apart from a run that was never finalized at all.
    const h = makeHarness()
    const { logger, calls } = captureLogger()
    const leaked = await h.seed({
      detachedSince: NOW - 60_000,
      sandboxKey: 'k-leak',
    })
    const clean = await h.seed({
      detachedSince: NOW - 60_000,
      sandboxKey: 'k-ok',
    })
    h.probes.set(leaked.runId, { state: 'finished', exitCode: 5 })
    h.probes.set(clean.runId, { state: 'finished', exitCode: 0 })

    const result = await reapDetachedRuns(
      h.options({
        logger,
        reclaim: (record) => {
          h.reclaimed.push(record)
          return record.runId === leaked.runId
            ? Promise.reject(new Error('instance store down'))
            : Promise.resolve()
        },
      }),
    )

    const entry = entryFor(result, leaked.runId)
    expect(entry.outcome).toBe('reclaim-failed')
    // The transcript-saved half of the signal: the drive succeeded, so the
    // status and the exit code are reported exactly as `'finalized'` reports
    // them. `'failed'` carried neither.
    expect(entry.status).toBe('completed')
    expect(entry.exitCode).toBe(5)
    expect(entry.error).toBeInstanceOf(Error)
    expect(h.logOf(leaked.runId).appended).toHaveLength(2)
    expect(h.logOf(leaked.runId).closes).toBe(1)
    expect((await h.runs.get(leaked.runId))?.status).toBe('completed')
    expect(calls.some((call) => call.level === 'error')).toBe(true)
    expect(result.outcomes).toMatchObject({
      'reclaim-failed': 1,
      finalized: 1,
      failed: 0,
    })
    // The sweep continued and the healthy run was reclaimed normally.
    expect(entryFor(result, clean.runId).outcome).toBe('finalized')
    expect(h.reclaimed.map((record) => record.runId)).toEqual([
      leaked.runId,
      clean.runId,
    ])
  })

  it('applies the default budget when none is given', async () => {
    const h = makeHarness()
    const done = await h.seed({ detachedSince: NOW - 60_000 })
    h.probes.set(done.runId, { state: 'finished', exitCode: 0 })
    // Nothing in a normal sweep may trip the default net.
    expect(DEFAULT_RUN_BUDGET_MS).toBeGreaterThan(0)
    const result = await reapDetachedRuns(h.options({ runBudgetMs: undefined }))
    expect(entryFor(result, done.runId).outcome).toBe('finalized')
    expect(result.outcomes['budget-exceeded']).toBe(0)
  })
})
