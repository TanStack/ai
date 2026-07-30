/**
 * The attach preflight: a hopeless attach must FAIL, not hang.
 *
 * Every test that could regress into a hang carries an explicit short bound
 * (`attachWaitMs` / `waitMs` in the tens of milliseconds, plus a per-test
 * timeout), so a regression fails the suite in under a second instead of
 * stalling CI until Vitest's default timeout.
 */
import { describe, expect, it } from 'vitest'
import { InMemoryRunStore } from '@tanstack/ai'
import {
  DEFAULT_ATTACH_JOURNAL_WAIT_MS,
  JournalAttachUnavailableError,
  awaitAttachableJournal,
} from '../src/attach-preflight'
import {
  exitSentinelLine,
  journalExistsCommand,
  journalPaths,
} from '../src/journal'
import { readJournalNdjson } from '../src/runner'
import type { RunStatus, RunStore } from '@tanstack/ai'
import type { ExecResult, SandboxHandle, SpawnHandle } from '../src/contracts'

/**
 * A run's real exit sentinel. Built, never hand-written: it carries a per-run
 * nonce (`journal.ts`), so a literal `{"__exit":0}` in a fixture is agent output
 * the reader must not stop at.
 */
function EXIT(runId: string, exitCode = 0): string {
  return exitSentinelLine(journalPaths(runId), exitCode)
}

async function* fromChunks(chunks: Array<string>): AsyncIterable<string> {
  for (const chunk of chunks) {
    await Promise.resolve()
    yield chunk
  }
}

async function collect<T>(it: AsyncIterable<T>): Promise<Array<T>> {
  const out: Array<T> = []
  for await (const value of it) out.push(value)
  return out
}

interface ProbeHandle {
  handle: SandboxHandle
  commands: Array<string>
  /** Flip the `test -f` answer mid-test, to model a journal that appears late. */
  setExists: (exists: boolean) => void
}

/**
 * A handle whose `test -f` answers from a mutable flag and whose `spawn`
 * replays one scripted journal.
 *
 * The existence answer is an EXIT CODE, not stdout: `journalExistsCommand` is a
 * shell `test -f`, so a preflight that read stdout instead would pass this test
 * while failing against every real provider.
 */
function probeHandle(
  options: {
    exists?: boolean
    script?: Array<string>
    execFails?: boolean
    /** Run the default script's sentinel belongs to. */
    runId?: string
  } = {},
): ProbeHandle {
  let exists = options.exists ?? false
  const commands: Array<string> = []
  const spawnHandle: SpawnHandle = {
    pid: -1,
    stdout: fromChunks(
      options.script ?? [`${EXIT(options.runId ?? 'probe-default')}\n`],
    ),
    stderr: fromChunks([]),
    stdin: { write: () => Promise.resolve(), end: () => Promise.resolve() },
    wait: () => Promise.resolve(0),
    kill: () => Promise.resolve(),
  }
  const handle: SandboxHandle = {
    id: 'probe',
    provider: 'probe',
    capabilities: {
      fs: true,
      exec: true,
      env: true,
      ports: false,
      backgroundProcesses: true,
      writableStdin: true,
      killableProcesses: true,
      snapshots: false,
      networkPolicy: false,
      durableFilesystem: false,
      fork: false,
    },
    fs: {} as SandboxHandle['fs'],
    git: {} as SandboxHandle['git'],
    process: {
      exec: (command): Promise<ExecResult> => {
        commands.push(command)
        if (options.execFails === true) {
          return Promise.reject(
            new Error('exec is unavailable on this provider'),
          )
        }
        const isProbe = command.startsWith('test -f')
        return Promise.resolve({
          stdout: '',
          stderr: '',
          exitCode: isProbe && !exists ? 1 : 0,
        })
      },
      spawn: (command) => {
        commands.push(command)
        return Promise.resolve(spawnHandle)
      },
    },
    ports: { connect: () => Promise.reject(new Error('unused')) },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }
  return {
    handle,
    commands,
    setExists: (value) => {
      exists = value
    },
  }
}

/** A store holding exactly one record, in the given lifecycle state. */
async function storeWith(
  runId: string,
  status: RunStatus,
  extra: { detachedSince?: number } = {},
): Promise<RunStore> {
  const runs = new InMemoryRunStore()
  await runs.createOrResume({ runId, threadId: `t-${runId}`, startedAt: 1 })
  await runs.update(runId, {
    status,
    ...(extra.detachedSince === undefined
      ? {}
      : { detachedSince: extra.detachedSince }),
  })
  return runs
}

describe('awaitAttachableJournal: an existing journal', () => {
  it('returns immediately without reading the run store at all', async () => {
    const runId = 'pf-exists-1'
    const probe = probeHandle({ exists: true })
    let storeReads = 0
    const runs: RunStore = {
      createOrResume: () => Promise.reject(new Error('unused')),
      update: () => Promise.resolve(),
      get: () => {
        storeReads += 1
        return Promise.resolve(null)
      },
    }
    await awaitAttachableJournal(probe.handle, {
      paths: journalPaths(runId),
      runId,
      runs,
      waitMs: 50,
    })
    // A journal that exists either carries a sentinel or is still growing;
    // neither hangs. Gating it on a record the store may have evicted would
    // make a perfectly readable journal unreadable.
    expect(storeReads).toBe(0)
    expect(probe.commands).toEqual([journalExistsCommand(journalPaths(runId))])
  })
})

describe('awaitAttachableJournal: fails fast', () => {
  it(
    'rejects an unknown runId with reason unknown-run',
    { timeout: 2_000 },
    async () => {
      const runId = 'pf-unknown-1'
      const probe = probeHandle({ exists: false })
      const error = await awaitAttachableJournal(probe.handle, {
        paths: journalPaths(runId),
        runId,
        runs: new InMemoryRunStore(),
        // Generous on purpose: if the store check were removed, this would take
        // 5s and blow the 2s test timeout instead of passing by luck.
        waitMs: 5_000,
      }).then(
        () => null,
        (reason: unknown) => reason,
      )
      expect(error).toBeInstanceOf(JournalAttachUnavailableError)
      if (!(error instanceof JournalAttachUnavailableError)) return
      expect(error.reason).toBe('unknown-run')
      expect(error.runId).toBe(runId)
      expect(error.message).toContain('no run record exists')
      expect(error.message).toContain(journalPaths(runId).journal)
    },
  )

  it.each(['completed', 'failed', 'aborted'] as const)(
    'rejects a %s run with no journal with reason terminal-run',
    { timeout: 2_000 },
    async (status) => {
      const runId = `pf-terminal-${status}`
      const probe = probeHandle({ exists: false })
      const error = await awaitAttachableJournal(probe.handle, {
        paths: journalPaths(runId),
        runId,
        runs: await storeWith(runId, status),
        waitMs: 5_000,
      }).then(
        () => null,
        (reason: unknown) => reason,
      )
      expect(error).toBeInstanceOf(JournalAttachUnavailableError)
      if (!(error instanceof JournalAttachUnavailableError)) return
      expect(error.reason).toBe('terminal-run')
      expect(error.message).toContain(`already '${status}'`)
      expect(error.message).toContain('event log')
    },
  )

  it('still fails fast on an unknown runId when the probe itself is unusable', async () => {
    // A provider whose `exec` rejects gives no existence answer, but the store
    // needs none — so the two verdicts that are decidable without a probe stay
    // decidable.
    const runId = 'pf-unknown-noprobe'
    await expect(
      awaitAttachableJournal(probeHandle({ execFails: true }).handle, {
        paths: journalPaths(runId),
        runId,
        runs: new InMemoryRunStore(),
        waitMs: 5_000,
      }),
    ).rejects.toThrow(/unknown to the RunStore/)
  })
})

describe('awaitAttachableJournal: the legitimate race', () => {
  it(
    'waits for a live run whose journal appears after a short delay',
    { timeout: 5_000 },
    async () => {
      const runId = 'pf-race-1'
      const probe = probeHandle({ exists: false })
      const runs = await storeWith(runId, 'running')
      // The driver has claimed the run and writes its first line ~120ms later.
      // This is the NORMAL case (`journalFollowCommand`'s `: >> file` exists for
      // it), so failing fast here would reintroduce the defect that fix cured.
      const timer = setTimeout(() => probe.setExists(true), 120)
      try {
        await awaitAttachableJournal(probe.handle, {
          paths: journalPaths(runId),
          runId,
          runs,
          waitMs: 3_000,
          probeIntervalMs: 20,
        })
      } finally {
        clearTimeout(timer)
      }
      // Resolving at all is the assertion; the probe count proves it polled
      // rather than getting lucky on the first read.
      expect(probe.commands.length).toBeGreaterThan(1)
    },
  )

  it(
    'waits for an interrupted run too — a HITL pause is not terminal',
    { timeout: 5_000 },
    async () => {
      const runId = 'pf-race-interrupted'
      const probe = probeHandle({ exists: false })
      const timer = setTimeout(() => probe.setExists(true), 60)
      try {
        await awaitAttachableJournal(probe.handle, {
          paths: journalPaths(runId),
          runId,
          runs: await storeWith(runId, 'interrupted'),
          waitMs: 3_000,
          probeIntervalMs: 20,
        })
      } finally {
        clearTimeout(timer)
      }
      expect(probe.commands.length).toBeGreaterThan(1)
    },
  )
})

describe('awaitAttachableJournal: the bounded wait', () => {
  it(
    'rejects with journal-timeout when a live run never writes one',
    { timeout: 2_000 },
    async () => {
      const runId = 'pf-timeout-1'
      const probe = probeHandle({ exists: false })
      const started = Date.now()
      const error = await awaitAttachableJournal(probe.handle, {
        paths: journalPaths(runId),
        runId,
        runs: await storeWith(runId, 'running'),
        waitMs: 80,
        probeIntervalMs: 20,
      }).then(
        () => null,
        (reason: unknown) => reason,
      )
      expect(error).toBeInstanceOf(JournalAttachUnavailableError)
      if (!(error instanceof JournalAttachUnavailableError)) return
      expect(error.reason).toBe('journal-timeout')
      expect(error.message).toContain('80ms')
      expect(error.message).toContain(journalPaths(runId).journal)
      // The bound is real: an unbounded wait would never reach this line, and
      // the 2s test timeout is what turns that into a failure.
      expect(Date.now() - started).toBeLessThan(1_500)
    },
  )

  it(
    'names the detached state in the timeout, since it points at a different cause',
    { timeout: 2_000 },
    async () => {
      const runId = 'pf-timeout-detached'
      const detachedSince = Date.UTC(2026, 0, 2, 3, 4, 5)
      const error = await awaitAttachableJournal(
        probeHandle({ exists: false }).handle,
        {
          paths: journalPaths(runId),
          runId,
          runs: await storeWith(runId, 'running', { detachedSince }),
          waitMs: 40,
          probeIntervalMs: 20,
        },
      ).then(
        () => null,
        (reason: unknown) => reason,
      )
      expect(error).toBeInstanceOf(JournalAttachUnavailableError)
      if (!(error instanceof JournalAttachUnavailableError)) return
      expect(error.message).toContain('detached since')
      expect(error.message).toContain(new Date(detachedSince).toISOString())
    },
  )

  it(
    'bounds the wait even with no run store wired, rather than hanging',
    { timeout: 2_000 },
    async () => {
      // No store means no unknown/terminal verdict is available, but a bound is
      // still strictly better than an infinite wait.
      const runId = 'pf-timeout-nostore'
      const error = await awaitAttachableJournal(
        probeHandle({ exists: false }).handle,
        { paths: journalPaths(runId), runId, waitMs: 40, probeIntervalMs: 20 },
      ).then(
        () => null,
        (reason: unknown) => reason,
      )
      expect(error).toBeInstanceOf(JournalAttachUnavailableError)
      if (!(error instanceof JournalAttachUnavailableError)) return
      expect(error.reason).toBe('journal-timeout')
      expect(error.message).toContain('no run store is wired')
    },
  )

  it('returns without throwing when the consumer aborts the wait', async () => {
    // The caller stopped caring; that is not a diagnosis about the run, so the
    // reader (whose own signal handling ends the read) gets control back.
    const runId = 'pf-abort-1'
    const controller = new AbortController()
    controller.abort()
    await awaitAttachableJournal(probeHandle({ exists: false }).handle, {
      paths: journalPaths(runId),
      runId,
      runs: await storeWith(runId, 'running'),
      // Would take 30s if the abort were ignored; the default test timeout
      // would catch that.
      waitMs: 30_000,
      signal: controller.signal,
    })
  })

  it(
    'does NOT fail open on an unusable probe — it bounds the wait instead',
    { timeout: 3_000 },
    async () => {
      // The fail-open branch this replaces (`if (existence === 'unknown')
      // return`) did not preserve a working attach: it handed control to a reader
      // whose first act CREATES the journal (`journalFollowCommand`'s
      // `: >> file`) and then tails it forever. And it was self-perpetuating —
      // the file it created made `test -f` succeed from then on, so every later
      // attach short-circuited on "the journal exists" and hung too, permanently,
      // long after the transient exec failure had cleared.
      const runId = 'pf-failopen-1'
      const probe = probeHandle({ execFails: true })
      const error = await awaitAttachableJournal(probe.handle, {
        paths: journalPaths(runId),
        runId,
        runs: await storeWith(runId, 'running'),
        waitMs: 120,
        probeIntervalMs: 20,
      }).then(
        () => null,
        (reason: unknown) => reason,
      )
      expect(error).toBeInstanceOf(JournalAttachUnavailableError)
      if (!(error instanceof JournalAttachUnavailableError)) return
      expect(error.reason).toBe('journal-timeout')
      // The message names the actual problem — the probe, not a missing file —
      // because those point at different causes.
      // No stopwatch assertion: the three assertions above already prove the
      // bound was applied (an unbounded wait produces no error at all), and this
      // case's own `{ timeout: 3_000 }` already turns an unbounded wait into a
      // failure — with a better message than a `2000` vs elapsed diff.
      expect(error.message).toContain('could not be probed at all')
      // It really re-probed rather than answering from the first failure: an
      // unusable probe may recover inside the window.
      expect(probe.commands.length).toBeGreaterThan(1)
    },
  )

  it(
    'still resolves if an unusable probe RECOVERS inside the window',
    { timeout: 3_000 },
    async () => {
      // Bounding must not mean giving up: a provider whose `exec` blipped once is
      // the case the old fail-open branch was written for, and it still attaches.
      const runId = 'pf-failopen-recovers'
      let calls = 0
      const probe = probeHandle({ exists: false })
      const inner = probe.handle.process.exec
      probe.handle.process.exec = (command, options) => {
        calls += 1
        if (calls <= 2) return Promise.reject(new Error('exec blipped'))
        probe.setExists(true)
        return inner(command, options)
      }
      await awaitAttachableJournal(probe.handle, {
        paths: journalPaths(runId),
        runId,
        runs: await storeWith(runId, 'running'),
        waitMs: 2_000,
        probeIntervalMs: 10,
      })
      expect(calls).toBeGreaterThan(2)
    },
  )

  it('defaults the bound to DEFAULT_ATTACH_JOURNAL_WAIT_MS', () => {
    // Pinned because it bounds an attach REQUEST, so an app fronting the route
    // with its own timeout has to be able to rely on the number.
    expect(DEFAULT_ATTACH_JOURNAL_WAIT_MS).toBe(10_000)
  })
})

describe('readJournalNdjson runs the preflight on attach only', () => {
  it(
    'fails an attach to an unknown runId instead of tailing an empty journal forever',
    { timeout: 3_000 },
    async () => {
      const runId = 'pf-wired-unknown'
      // The script would never deliver a sentinel, so a missing preflight means
      // this read never returns — which is exactly the defect.
      const probe = probeHandle({ exists: false, script: [] })
      await expect(
        collect(
          readJournalNdjson(probe.handle, {
            journal: {
              runId,
              attach: true,
              runs: new InMemoryRunStore(),
              attachWaitMs: 5_000,
            },
          }),
        ),
      ).rejects.toBeInstanceOf(JournalAttachUnavailableError)
      // It never even spawned a tail on a journal that cannot exist.
      expect(probe.commands.some((c) => c.includes('tail'))).toBe(false)
    },
  )

  it(
    'honors attachWaitMs as the bound for a live run with no journal',
    { timeout: 3_000 },
    async () => {
      const runId = 'pf-wired-timeout'
      const probe = probeHandle({ exists: false, script: [] })
      const error = await collect(
        readJournalNdjson(probe.handle, {
          journal: {
            runId,
            attach: true,
            runs: await storeWith(runId, 'running'),
            attachWaitMs: 60,
          },
        }),
      ).then(
        () => null,
        (reason: unknown) => reason,
      )
      expect(error).toBeInstanceOf(JournalAttachUnavailableError)
      if (!(error instanceof JournalAttachUnavailableError)) return
      expect(error.reason).toBe('journal-timeout')
    },
  )

  it('does NOT gate a FRESH run, whose journal does not exist yet by design', async () => {
    // A fresh run's journal is created by its own `journaledCommand` spawn. The
    // store here is empty, so a preflight that ran on this path would reject it
    // as an unknown run and break every new durable run.
    const runId = 'pf-fresh-1'
    const probe = probeHandle({
      exists: false,
      script: [`{"a":1}\n${EXIT(runId)}\n`],
    })
    expect(
      await collect(
        readJournalNdjson(probe.handle, {
          journal: { runId, runs: new InMemoryRunStore() },
        }),
      ),
    ).toEqual([{ a: 1 }])
    expect(probe.commands.some((c) => c.startsWith('test -f'))).toBe(false)
  })
})
