/**
 * Asserts the barrel (`src/index.ts`) actually RESOLVES Phase 3's durable-run
 * surface, importing exclusively from `../src/index` — never from the
 * individual modules, which would test nothing about the barrel itself.
 *
 * Error classes are constructed and instanceof-checked rather than merely
 * `typeof x === 'function'`-checked: a class mis-exported as `export type`
 * still compiles and still passes a `typeof` check in some configurations,
 * but `new` and `instanceof` against a real import can't be faked that way.
 */
import { describe, expect, it } from 'vitest'
import { EventType, InMemoryRunStore, memoryStream } from '@tanstack/ai'
import { InMemoryLockStore } from '@tanstack/ai/locks'
import { makeFakeHandle } from './fakes'
import {
  DEFAULT_ATTACH_JOURNAL_WAIT_MS,
  DEFAULT_DETACHED_RUN_TTL,
  DEFAULT_EXIT_PROBE_BYTES,
  DEFAULT_FENCE_QUIET_MS,
  DEFAULT_MAX_DELETES,
  DEFAULT_MAX_OUT_OF_BAND_SKIP,
  DEFAULT_MAX_RUNS,
  DEFAULT_ORPHAN_TTL_MS,
  DEFAULT_RUN_BUDGET_MS,
  DurableRunIdRequiredError,
  DurableThreadIdRequiredError,
  JournalAttachUnavailableError,
  JournalReplayDivergedError,
  JournalReplayThreadIdMismatchError,
  RunClaimLostError,
  RunClaimNotAcquiredError,
  RunDriverPipeOutsideClaimError,
  SandboxDurabilityCapability,
  alignedIfAttaching,
  alignToStoredLog,
  decodeJournalRunId,
  getSandboxDurability,
  isBridgeCustomChunk,
  journalExitProbeCommand,
  journalListCommand,
  journalMtimeListCommand,
  journalOptionsFor,
  journalPaths,
  parseJournalExit,
  exitSentinelLine,
  parseJournalMtimeListing,
  probeRunExit,
  provideSandboxDurability,
  pruneJournals,
  reapDetachedRuns,
  reclaimSandbox,
  resolveDurableRunId,
  resolveDurableThreadId,
  sandboxReclaimer,
  sandboxRunDriver,
} from '../src/index'
import type {
  AwaitAttachableJournalOptions,
  DecodedJournalRunId,
  JournalDirEntry,
  JournalMtimeListing,
  KeptJournal,
  KeptJournalReason,
  PruneJournalsFailure,
  PruneJournalsOptions,
  PruneJournalsResult,
  ReapOptions,
  ReapResult,
  ReapRunEntry,
  ReapRunOutcome,
  ReclaimOutcome,
  ReclaimSandboxOptions,
  RunExitProbe,
  SandboxDurabilityOptions,
  SandboxRunDriverOptions,
  SandboxRunDurability,
} from '../src/index'
import type { CapabilityContext, RunStore, StreamChunk } from '@tanstack/ai'

/** Minimal capability context sufficient for testing capability round-trips. */
function makeCtx(): CapabilityContext {
  return {
    capabilities: { markProvided: () => undefined },
  } as unknown as CapabilityContext
}

function makeDurability(runId: string): SandboxRunDurability {
  return {
    runs: new InMemoryRunStore(),
    adapter: memoryStream(new Request(`https://x/run?runId=${runId}`)),
    journalDir: '/tmp/tanstack-runs',
    attach: false,
    detachOnDisconnect: true,
    detachedRunTtlMs: 30 * 60_000,
  }
}

describe('barrel: durability seam', () => {
  it('SandboxDurabilityCapability round-trips through the barrel accessors', () => {
    const ctx = makeCtx()
    const durability = makeDurability('run-1')

    provideSandboxDurability(ctx, durability)

    expect(getSandboxDurability(ctx, { optional: true })).toBe(durability)
    // The capability token itself must be the same one the accessors close
    // over, or a consumer's own `getOptional(SandboxDurabilityCapability)`
    // would silently miss what `provideSandboxDurability` wrote.
    expect(SandboxDurabilityCapability.capabilityName).toBe(
      'sandbox-durability',
    )
  })

  it('publishes the documented defaults', () => {
    expect(DEFAULT_DETACHED_RUN_TTL).toBe('30m')
    expect(DEFAULT_FENCE_QUIET_MS).toBe(5_000)
    expect(DEFAULT_MAX_OUT_OF_BAND_SKIP).toBe(64)
  })

  it('resolveDurableRunId and journalOptionsFor/alignedIfAttaching are wired end to end', async () => {
    expect(
      resolveDurableRunId('caller-run', {
        durable: true,
        adapter: 'test',
        fallback: () => 'generated',
      }),
    ).toBe('caller-run')

    const durability = makeDurability('run-2')
    const opts = journalOptionsFor(durability, 'run-2')
    expect(opts).toEqual({
      runId: 'run-2',
      dir: '/tmp/tanstack-runs',
      attach: false,
    })

    // Non-attaching: alignedIfAttaching must be a no-op passthrough.
    async function* one(): AsyncGenerator<StreamChunk> {
      yield { type: EventType.RUN_STARTED } as StreamChunk
    }
    const aligned = alignedIfAttaching(one(), durability)
    const collected: Array<StreamChunk> = []
    for await (const chunk of aligned) collected.push(chunk)
    expect(collected).toHaveLength(1)
  })

  it('resolveDurableThreadId is wired through the barrel, attach quadrant included', () => {
    expect(
      resolveDurableThreadId('caller-thread', {
        durable: true,
        attaching: true,
        adapter: 'test',
        fallback: () => 'generated',
      }),
    ).toBe('caller-thread')
    // The durable-fresh row must reach the barrel intact too, or a consumer
    // upgrading would find every new durable run refused.
    expect(
      resolveDurableThreadId(undefined, {
        durable: true,
        attaching: false,
        adapter: 'test',
        fallback: () => 'generated',
      }),
    ).toBe('generated')
    expect(() =>
      resolveDurableThreadId(undefined, {
        durable: true,
        attaching: true,
        adapter: 'test',
        fallback: () => 'generated',
      }),
    ).toThrow(DurableThreadIdRequiredError)
  })

  it('isBridgeCustomChunk recognizes only CUSTOM chunks', () => {
    expect(
      isBridgeCustomChunk({
        type: EventType.CUSTOM,
        name: 'x',
        value: {},
      } as StreamChunk),
    ).toBe(true)
    expect(
      isBridgeCustomChunk({ type: EventType.RUN_STARTED } as StreamChunk),
    ).toBe(false)
  })

  it('alignToStoredLog is reachable through the barrel', async () => {
    const durability = makeDurability('run-3')
    async function* empty(): AsyncGenerator<StreamChunk> {}
    const result: Array<StreamChunk> = []
    for await (const chunk of alignToStoredLog(empty(), {
      durability: durability.adapter,
    })) {
      result.push(chunk)
    }
    expect(result).toHaveLength(0)
  })
})

describe('barrel: run driver', () => {
  it('sandboxRunDriver assembles a RunDriverOptions-shaped object', () => {
    const input: SandboxRunDriverOptions = {
      request: new Request('https://x/run?runId=run-4'),
      runs: new InMemoryRunStore(),
      locks: new InMemoryLockStore(),
      durability: (runId) =>
        memoryStream(new Request(`https://x/run?runId=${runId}`)),
      drive: async function* () {},
    }
    const result = sandboxRunDriver(input)
    expect(result.request).toBe(input.request)
    expect(result.runs).toBe(input.runs)
    expect(result.locks).toBe(input.locks)
    expect(result.drive).toBe(input.drive)
    expect(typeof result.claim).toBe('function')
    expect(typeof result.pipe).toBe('function')
  })
})

describe('barrel: error classes are values, not types (instanceof must work)', () => {
  it('DurableRunIdRequiredError', () => {
    const err = new DurableRunIdRequiredError('codex')
    expect(err).toBeInstanceOf(DurableRunIdRequiredError)
    expect(err).toBeInstanceOf(Error)
    expect(err.adapter).toBe('codex')
  })

  it('DurableThreadIdRequiredError', () => {
    const err = new DurableThreadIdRequiredError('grok-build')
    expect(err).toBeInstanceOf(DurableThreadIdRequiredError)
    expect(err).toBeInstanceOf(Error)
    expect(err.adapter).toBe('grok-build')
  })

  it('JournalReplayDivergedError', () => {
    const err = new JournalReplayDivergedError(3, 'a', 'b')
    expect(err).toBeInstanceOf(JournalReplayDivergedError)
    expect(err).toBeInstanceOf(Error)
    expect(err.index).toBe(3)
  })

  it('RunClaimNotAcquiredError', () => {
    const err = new RunClaimNotAcquiredError('run-1', 'terminal')
    expect(err).toBeInstanceOf(RunClaimNotAcquiredError)
    expect(err).toBeInstanceOf(Error)
    expect(err.reason).toBe('terminal')
  })

  it('RunClaimLostError', () => {
    const err = new RunClaimLostError('run-1', 2, 3)
    expect(err).toBeInstanceOf(RunClaimLostError)
    expect(err).toBeInstanceOf(Error)
    expect(err.heldEpoch).toBe(2)
  })

  it('RunDriverPipeOutsideClaimError', () => {
    const err = new RunDriverPipeOutsideClaimError('run-1')
    expect(err).toBeInstanceOf(RunDriverPipeOutsideClaimError)
    expect(err).toBeInstanceOf(Error)
    expect(err.runId).toBe('run-1')
  })

  it('JournalAttachUnavailableError carries a branchable reason', () => {
    const err = new JournalAttachUnavailableError('run-1', 'unknown-run', 'why')
    expect(err).toBeInstanceOf(JournalAttachUnavailableError)
    expect(err).toBeInstanceOf(Error)
    expect(err.runId).toBe('run-1')
    expect(err.reason).toBe('unknown-run')
    expect(DEFAULT_ATTACH_JOURNAL_WAIT_MS).toBeGreaterThan(0)
  })

  it('JournalReplayThreadIdMismatchError is a JournalReplayDivergedError subclass', () => {
    // The subclass relationship is part of the published surface: a consumer
    // already branching on the general class must keep working.
    const err = new JournalReplayThreadIdMismatchError(0, 's', 'r', 'ta', 'tb')
    expect(err).toBeInstanceOf(JournalReplayThreadIdMismatchError)
    expect(err).toBeInstanceOf(JournalReplayDivergedError)
    expect(err.storedThreadId).toBe('ta')
    expect(err.replayedThreadId).toBe('tb')
  })
})

describe('barrel: journal directory commands + parsers', () => {
  it('journalListCommand / journalMtimeListCommand / journalExitProbeCommand compose the documented shell text', () => {
    const dir = '/tmp/barrel-journal-test'
    const paths = journalPaths('barrel-run-1', dir)
    expect(journalListCommand(dir)).toContain('ls -1')
    expect(journalListCommand(dir)).toContain(dir)
    expect(journalMtimeListCommand(dir)).toContain("stat -c '%Y %n'")
    expect(journalExitProbeCommand(paths)).toContain('base64')
  })

  it('parseJournalMtimeListing turns a witnessed stat listing into entries', () => {
    const dir = '/tmp/barrel-journal-test'
    const listing = parseJournalMtimeListing(
      `1700000000 ${dir}\n1700000000 ${dir}/foo.ndjson\n`,
      dir,
    )
    expect(listing).toEqual({
      kind: 'listed',
      entries: [{ name: 'foo.ndjson', mtimeMs: 1_700_000_000_000 }],
    })
    // Unavailable is a distinct value from an empty listing — never `[]`.
    expect(parseJournalMtimeListing('', dir)).toEqual({ kind: 'unavailable' })
  })

  it('parseJournalExit finds the sentinel; decodeJournalRunId recovers the runId', () => {
    const probed = journalPaths('barrel-probe-1', '/tmp/barrel-journal-test')
    expect(
      parseJournalExit(
        `{"delta":"hi"}\n${exitSentinelLine(probed, 5)}\n`,
        probed,
      ),
    ).toBe(5)
    expect(parseJournalExit('no sentinel here\n', probed)).toBeNull()
    // An unnonced sentinel is agent output, not the shell's: refused.
    expect(parseJournalExit('{"__exit":5}\n', probed)).toBeNull()

    const paths = journalPaths('barrel-run-1', '/tmp/barrel-journal-test')
    const journalName = paths.journal.slice(paths.dir.length + 1)
    expect(decodeJournalRunId(journalName)).toEqual({
      kind: 'runId',
      runId: 'barrel-run-1',
    })
    // No recognized `.ndjson`/`.err` extension: refused, not guessed at.
    expect(decodeJournalRunId('not-a-journal-name')).toEqual({
      kind: 'malformed',
    })
  })
})

describe('barrel: journal-directory sweep (pruneJournals)', () => {
  it('publishes the documented defaults', () => {
    expect(DEFAULT_ORPHAN_TTL_MS).toBe(60 * 60 * 1000)
    expect(DEFAULT_MAX_DELETES).toBe(200)
  })

  it('deletes a terminal run journal and keeps a running one, in the same sweep', async () => {
    const dir = '/tmp/barrel-sweep-test'
    const terminalId = 'barrel-terminal'
    const runningId = 'barrel-running'
    const terminalName = journalPaths(terminalId, dir).journal.slice(
      dir.length + 1,
    )
    const runningName = journalPaths(runningId, dir).journal.slice(
      dir.length + 1,
    )

    const handle = makeFakeHandle('sbx', 'fake')
    handle.process.exec = (command: string) => {
      if (command.includes('ls -1')) {
        return Promise.resolve({
          stdout: `${terminalName}\n${runningName}\n`,
          stderr: '',
          exitCode: 0,
        })
      }
      if (command.includes('stat -c')) {
        return Promise.resolve({
          stdout: `1700000000 ${dir}\n`,
          stderr: '',
          exitCode: 0,
        })
      }
      // The `rm -f` deletion.
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
    }

    const runs: Pick<RunStore, 'get'> = {
      get: (runId) => {
        if (runId === terminalId) {
          return Promise.resolve({
            runId,
            threadId: 't',
            status: 'completed',
            startedAt: 1,
          })
        }
        if (runId === runningId) {
          return Promise.resolve({
            runId,
            threadId: 't',
            status: 'running',
            startedAt: 1,
          })
        }
        return Promise.resolve(null)
      },
    }

    const result = await pruneJournals({ handle, runs, dir })
    // The terminal run's journal was actually deleted...
    expect(result.deleted).toEqual([terminalId])
    // ...and the running one was left alone, with the reason recorded — proof
    // the sweep distinguished the two rather than deleting (or keeping)
    // everything indiscriminately.
    expect(result.kept).toEqual([
      { runId: runningId, names: [runningName], reason: 'non-terminal' },
    ])
  })
})

describe('barrel: reaper (reapDetachedRuns / probeRunExit)', () => {
  it('publishes the documented defaults', () => {
    expect(DEFAULT_RUN_BUDGET_MS).toBe(30_000)
    expect(DEFAULT_MAX_RUNS).toBe(25)
    expect(DEFAULT_EXIT_PROBE_BYTES).toBe(4096)
  })

  it('probeRunExit reads the exit sentinel out of a fake handle', async () => {
    const frame = Buffer.from(
      `${exitSentinelLine(journalPaths('barrel-probe'), 9)}\n`,
    ).toString('base64')
    const handle = makeFakeHandle('sbx', 'fake')
    handle.process.exec = () =>
      Promise.resolve({ stdout: frame, stderr: '', exitCode: 0 })
    expect(await probeRunExit({ handle, runId: 'barrel-probe' })).toEqual({
      state: 'finished',
      exitCode: 9,
    })
  })

  it('reapDetachedRuns finalizes an expired run and writes it terminal', async () => {
    const runs = new InMemoryRunStore()
    const runId = 'barrel-reap-1'
    const now = 1_700_000_000_000
    await runs.createOrResume({
      runId,
      threadId: 'barrel-thread',
      startedAt: 1,
    })
    // Detached before `now`, with `detachedRunTtlMs: 0` below — so it is
    // already past the (inclusive) expiry cutoff.
    await runs.update(runId, { detachedSince: now - 1_000 })

    const result = await reapDetachedRuns({
      runs,
      locks: new InMemoryLockStore(),
      durability: () =>
        memoryStream(new Request(`https://x/run?runId=${runId}`)),
      // Never consulted on the expiry path — asserting that would be
      // circular — but the option is required, so answer the safe value.
      hasFinished: () => Promise.resolve({ state: 'unknown' }),
      drive: async function* () {},
      now,
      detachedRunTtlMs: 0,
      fenceQuietMs: 0,
    })

    expect(result.considered).toBe(1)
    const entry = result.runs.find((run) => run.runId === runId)
    expect(entry?.outcome).toBe('expired')
    expect((await runs.get(runId))?.status).toBe('completed')
  })
})

describe('barrel: sandbox reclaim (reclaimSandbox / sandboxReclaimer)', () => {
  it('reclaimSandbox reports no-sandbox-key for a run that never had one', async () => {
    const outcome = await reclaimSandbox(
      { runId: 'r1', threadId: 't1', status: 'completed', startedAt: 1 },
      {
        provider: {
          name: 'fake',
          capabilities: () => ({
            fs: true,
            exec: true,
            env: true,
            ports: false,
            backgroundProcesses: false,
            writableStdin: false,
            killableProcesses: false,
            snapshots: false,
            networkPolicy: false,
            durableFilesystem: false,
            fork: false,
          }),
          create: () => {
            throw new Error('not used')
          },
          resume: () => Promise.resolve(null),
          destroy: () => Promise.resolve(),
        },
        instances: {
          get: () => Promise.resolve(null),
          upsert: () => Promise.resolve(),
          delete: () => Promise.resolve(),
        },
      },
    )
    expect(outcome).toBe('no-sandbox-key')
  })

  it("sandboxReclaimer adapts reclaimSandbox to the reaper's reclaim callback and actually destroys", async () => {
    const destroyed: Array<string> = []
    const deleted: Array<string> = []
    const reclaim = sandboxReclaimer({
      provider: {
        name: 'fake',
        capabilities: () => ({
          fs: true,
          exec: true,
          env: true,
          ports: false,
          backgroundProcesses: false,
          writableStdin: false,
          killableProcesses: false,
          snapshots: false,
          networkPolicy: false,
          durableFilesystem: false,
          fork: false,
        }),
        create: () => {
          throw new Error('not used')
        },
        resume: () => Promise.resolve(null),
        destroy: (input) => {
          destroyed.push(input.id)
          return Promise.resolve()
        },
      },
      instances: {
        get: () =>
          Promise.resolve({
            key: 'k1',
            provider: 'fake',
            providerSandboxId: 'sbx-1',
            threadId: 't1',
            updatedAt: 1,
          }),
        upsert: () => Promise.resolve(),
        delete: (key) => {
          deleted.push(key)
          return Promise.resolve()
        },
      },
    })
    await reclaim({
      runId: 'r1',
      threadId: 't1',
      status: 'completed',
      startedAt: 1,
      sandboxKey: 'k1',
    })
    expect(destroyed).toEqual(['sbx-1'])
    expect(deleted).toEqual(['k1'])
  })
})

// Type-only usage: fails to compile (not just at runtime) if the barrel drops
// either type export.
function typeSurfaceStillExported(
  a: SandboxDurabilityOptions,
  b: SandboxRunDurability,
  c: SandboxRunDriverOptions,
  d: AwaitAttachableJournalOptions,
): void {
  void a
  void b
  void c
  void d
}
void typeSurfaceStillExported

// Same purpose, for the journal-sweep / reap / reclaim type surface added by
// this task.
function newTypeSurfaceStillExported(
  a: JournalMtimeListing,
  b: JournalDirEntry,
  c: DecodedJournalRunId,
  d: PruneJournalsOptions,
  e: PruneJournalsResult,
  f: KeptJournal,
  g: KeptJournalReason,
  h: PruneJournalsFailure,
  i: RunExitProbe,
  j: ReapRunOutcome,
  k: ReapRunEntry,
  l: ReapResult,
  m: ReapOptions,
  n: ReclaimOutcome,
  o: ReclaimSandboxOptions,
): void {
  void a
  void b
  void c
  void d
  void e
  void f
  void g
  void h
  void i
  void j
  void k
  void l
  void m
  void n
  void o
}
void newTypeSurfaceStillExported
