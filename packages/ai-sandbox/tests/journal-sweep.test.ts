/**
 * Tests for the journal sweep.
 *
 * **Every keep-test is paired with a delete-test in the SAME configuration.** A
 * sweep over an empty listing satisfies every `deleted: []` assertion, so a
 * do-nothing implementation would pass a suite of keep-assertions alone. Each
 * scenario below therefore puts a journal that MUST be deleted in the same sweep
 * as the journal that must be kept, which proves the sweep was capable of
 * deleting under exactly those conditions and chose not to for this entry.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_DELETES,
  DEFAULT_ORPHAN_TTL_MS,
  pruneJournals,
} from '../src/journal-sweep'
import { journalPaths } from '../src/journal'
import { captureLogger } from './fakes'
import type { RunRecord, RunStatus, RunStore } from '@tanstack/ai'
import type {
  ExecResult,
  SandboxCapabilities,
  SandboxHandle,
} from '../src/contracts'

const DIR = '/tmp/sweep-test'

function caps(): SandboxCapabilities {
  return {
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
  }
}

/** Unique per case: a reused runId would append to a previous case's journal. */
function freshRunId(): string {
  return `js-${crypto.randomUUID()}`
}

/** The two filenames `ls -1` would report for a run, derived the way the sweep does. */
function fileNames(runId: string): { journal: string; stderr: string } {
  const paths = journalPaths(runId, DIR)
  const strip = (full: string): string => full.slice(DIR.length + 1)
  return { journal: strip(paths.journal), stderr: strip(paths.stderr) }
}

interface FakeFile {
  name: string
  /** Epoch ms; omitted means the mtime listing reports no entry for it. */
  mtimeMs?: number
}

interface FakeSandboxInput {
  files: Array<FakeFile>
  /**
   * Raw stdout for `stat -c '%Y %n'`. Defaults to a well-formed listing (witness
   * line + one line per file with an mtime). Pass `''` to model BusyBox's
   * unrecognised-flag behaviour: exit 1, EMPTY stdout, diagnostic on stderr.
   */
  mtimeStdout?: string
  /** Make the `ls -1` exec reject. */
  listRejects?: boolean
  /** Override the `rm -f` result (or make it reject). */
  rm?: (command: string) => Promise<ExecResult>
}

interface FakeSandbox {
  handle: SandboxHandle
  /** Every command handed to `process.exec`, in order. */
  execCommands: Array<string>
  /** Every `handle.fs.*` method the code under test touched. MUST stay empty. */
  fsCalls: Array<string>
}

function fakeSandbox(input: FakeSandboxInput): FakeSandbox {
  const execCommands: Array<string> = []
  const fsCalls: Array<string> = []

  const witness = `1700000000 ${DIR}`
  const mtimeStdout =
    input.mtimeStdout ??
    [
      witness,
      ...input.files.flatMap((file) =>
        file.mtimeMs === undefined
          ? []
          : [`${Math.floor(file.mtimeMs / 1000)} ${DIR}/${file.name}`],
      ),
    ].join('\n')

  const ok = (stdout: string): Promise<ExecResult> =>
    Promise.resolve({ stdout, stderr: '', exitCode: 0 })

  // Every fs method rejects: the sweep must touch the journal directory through
  // the shell only (on local-process, `fs.*` resolves `/tmp` under the sandbox
  // root while a shell redirect hits the host's real `/tmp`).
  const rejectFs = (method: string) => (): Promise<never> => {
    fsCalls.push(method)
    return Promise.reject(
      new Error(`fs.${method} must not be used by the journal sweep`),
    )
  }

  const handle: SandboxHandle = {
    id: 'fake',
    provider: 'fake',
    capabilities: caps(),
    fs: {
      read: rejectFs('read'),
      readBytes: rejectFs('readBytes'),
      write: rejectFs('write'),
      list: rejectFs('list'),
      mkdir: rejectFs('mkdir'),
      remove: rejectFs('remove'),
      rename: rejectFs('rename'),
      exists: rejectFs('exists'),
    },
    git: {} as SandboxHandle['git'],
    process: {
      exec: (command) => {
        execCommands.push(command)
        if (command.startsWith('ls -1')) {
          if (input.listRejects) {
            return Promise.reject(new Error('ls exploded'))
          }
          return ok(input.files.map((file) => file.name).join('\n'))
        }
        if (command.startsWith('stat -c')) return ok(mtimeStdout)
        if (command.startsWith('rm -f')) {
          return input.rm ? input.rm(command) : ok('')
        }
        return Promise.reject(new Error(`unexpected command: ${command}`))
      },
      spawn: () => Promise.reject(new Error('spawn must not be used')),
    },
    ports: { connect: () => Promise.reject(new Error('unused')) },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }

  return { handle, execCommands, fsCalls }
}

interface FakeStore {
  runs: Pick<RunStore, 'get'>
  /** runIds `get` was asked about, in order. */
  asked: Array<string>
}

/**
 * A store that answers from a map. `throwFor` models a backend that is briefly
 * unreachable for one runId.
 */
function fakeStore(
  statuses: Record<string, RunStatus>,
  throwFor: Array<string> = [],
): FakeStore {
  const asked: Array<string> = []
  return {
    asked,
    runs: {
      get: (runId) => {
        asked.push(runId)
        if (throwFor.includes(runId)) {
          return Promise.reject(new Error(`store unreachable for ${runId}`))
        }
        const status = statuses[runId]
        if (status === undefined) return Promise.resolve(null)
        const record: RunRecord = {
          runId,
          threadId: `thread-${runId}`,
          status,
          startedAt: 1,
        }
        return Promise.resolve(record)
      },
    },
  }
}

/** Filenames + a well-formed recent mtime, for a run the age gate should not expire. */
function freshFiles(runId: string, now: number): Array<FakeFile> {
  const names = fileNames(runId)
  return [
    { name: names.journal, mtimeMs: now },
    { name: names.stderr, mtimeMs: now },
  ]
}

/** Filenames + an mtime far past `orphanTtlMs`. */
function ancientFiles(runId: string, now: number): Array<FakeFile> {
  const names = fileNames(runId)
  const old = now - DEFAULT_ORPHAN_TTL_MS * 10
  return [
    { name: names.journal, mtimeMs: old },
    { name: names.stderr, mtimeMs: old },
  ]
}

const NOW = 1_800_000_000_000

describe('pruneJournals — the store decides', () => {
  it('deletes the journal of a run the store reports terminal', async () => {
    for (const status of ['completed', 'failed', 'aborted'] as const) {
      const runId = freshRunId()
      const sandbox = fakeSandbox({ files: freshFiles(runId, NOW) })
      const store = fakeStore({ [runId]: status })

      const result = await pruneJournals({
        handle: sandbox.handle,
        runs: store.runs,
        dir: DIR,
        now: NOW,
      })

      expect(result.deleted).toEqual([runId])
      expect(result.kept).toEqual([])
    }
  })

  it('KEEPS a running run, while deleting a terminal one in the same sweep', async () => {
    const running = freshRunId()
    const done = freshRunId()
    const sandbox = fakeSandbox({
      files: [...freshFiles(running, NOW), ...freshFiles(done, NOW)],
    })
    const store = fakeStore({ [running]: 'running', [done]: 'completed' })

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
    })

    // The paired deletion proves the sweep COULD delete in this configuration.
    expect(result.deleted).toEqual([done])
    expect(result.kept).toEqual([
      {
        runId: running,
        names: [fileNames(running).journal, fileNames(running).stderr],
        reason: 'non-terminal',
      },
    ])
  })

  it("KEEPS an 'interrupted' run — a pause is not terminal — while deleting a completed one in the same sweep", async () => {
    const paused = freshRunId()
    const done = freshRunId()
    const sandbox = fakeSandbox({
      files: [...freshFiles(paused, NOW), ...freshFiles(done, NOW)],
    })
    const store = fakeStore({ [paused]: 'interrupted', [done]: 'completed' })

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
    })

    expect(result.deleted).toEqual([done])
    expect(result.kept).toEqual([
      {
        runId: paused,
        names: [fileNames(paused).journal, fileNames(paused).stderr],
        reason: 'non-terminal',
      },
    ])
    // And the interrupted journal was never handed to `rm`.
    expect(
      sandbox.execCommands.filter((command) => command.includes(paused)),
    ).toEqual([])
  })

  it('KEEPS a journal when the store lookup throws, while deleting a terminal one in the same sweep', async () => {
    const unanswered = freshRunId()
    const done = freshRunId()
    const sandbox = fakeSandbox({
      files: [...freshFiles(unanswered, NOW), ...freshFiles(done, NOW)],
    })
    const store = fakeStore({ [done]: 'completed' }, [unanswered])

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
    })

    expect(result.deleted).toEqual([done])
    expect(result.kept).toEqual([
      {
        runId: unanswered,
        names: [fileNames(unanswered).journal, fileNames(unanswered).stderr],
        reason: 'store-error',
      },
    ])
    expect(result.failures).toEqual([
      {
        stage: 'store',
        runId: unanswered,
        message: `store unreachable for ${unanswered}`,
      },
    ])
  })
})

describe('pruneJournals — undecodable names are never deleted', () => {
  it('KEEPS malformed and truncated names without asking the store, while deleting a decodable terminal journal in the same sweep', async () => {
    const done = freshRunId()
    // `_` is the escape prefix and must be followed by exactly two hex digits;
    // a bare `_` is malformed. `not-a-journal` has no known extension.
    const malformed = 'bad_zz.ndjson'
    const noExtension = 'not-a-journal'
    // The length-capped form: exactly 200 chars ending in `-` + a 16-hex hash.
    const truncated = `${'a'.repeat(183)}-${'0'.repeat(16)}.ndjson`

    const sandbox = fakeSandbox({
      files: [
        { name: malformed, mtimeMs: NOW - DEFAULT_ORPHAN_TTL_MS * 10 },
        { name: noExtension, mtimeMs: NOW - DEFAULT_ORPHAN_TTL_MS * 10 },
        { name: truncated, mtimeMs: NOW - DEFAULT_ORPHAN_TTL_MS * 10 },
        ...freshFiles(done, NOW),
      ],
    })
    const store = fakeStore({ [done]: 'completed' })

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
    })

    expect(result.deleted).toEqual([done])
    expect(result.kept).toEqual([
      { names: [malformed], reason: 'undecodable-name' },
      { names: [noExtension], reason: 'undecodable-name' },
      { names: [truncated], reason: 'undecodable-name' },
    ])
    // A truncated name decodes to a plausible but WRONG runId, so the store must
    // not even be consulted about it.
    expect(store.asked).toEqual([done])
    expect(
      sandbox.execCommands.filter((command) => command.startsWith('rm -f')),
    ).toHaveLength(1)
  })
})

describe('pruneJournals — the age gate', () => {
  it('deletes an orphan whose files are older than orphanTtlMs', async () => {
    const orphan = freshRunId()
    const sandbox = fakeSandbox({ files: ancientFiles(orphan, NOW) })
    const store = fakeStore({})

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
    })

    expect(result.ageGate).toBe('listed')
    expect(result.deleted).toEqual([orphan])
  })

  it('KEEPS a recent orphan, while deleting an ancient one in the same sweep', async () => {
    const recent = freshRunId()
    const ancient = freshRunId()
    const sandbox = fakeSandbox({
      files: [...freshFiles(recent, NOW), ...ancientFiles(ancient, NOW)],
    })
    const store = fakeStore({})

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
    })

    expect(result.deleted).toEqual([ancient])
    expect(result.kept).toEqual([
      {
        runId: recent,
        names: [fileNames(recent).journal, fileNames(recent).stderr],
        reason: 'orphan-too-recent',
      },
    ])
  })

  it('is decided by the NEWEST of a run’s files: an old journal with a just-written sidecar is kept, while a wholly-old run is deleted in the same sweep', async () => {
    const active = freshRunId()
    const ancient = freshRunId()
    const activeNames = fileNames(active)
    const sandbox = fakeSandbox({
      files: [
        {
          name: activeNames.journal,
          mtimeMs: NOW - DEFAULT_ORPHAN_TTL_MS * 10,
        },
        { name: activeNames.stderr, mtimeMs: NOW },
        ...ancientFiles(ancient, NOW),
      ],
    })
    const store = fakeStore({})

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
    })

    expect(result.deleted).toEqual([ancient])
    expect(result.kept).toEqual([
      {
        runId: active,
        names: [activeNames.journal, activeNames.stderr],
        reason: 'orphan-too-recent',
      },
    ])
  })

  it('KEEPS an orphan whose mtime the listing did not report, while deleting an aged one in the same sweep', async () => {
    const unlisted = freshRunId()
    const ancient = freshRunId()
    const unlistedNames = fileNames(unlisted)
    const sandbox = fakeSandbox({
      files: [
        // Present in `ls -1` but with no `stat` line: created between the two
        // execs, so its age is simply unknown.
        { name: unlistedNames.journal },
        ...ancientFiles(ancient, NOW),
      ],
    })
    const store = fakeStore({})

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
    })

    expect(result.deleted).toEqual([ancient])
    expect(result.kept).toEqual([
      {
        runId: unlisted,
        names: [unlistedNames.journal],
        reason: 'age-gate-missing-entry',
      },
    ])
  })

  it('applies a caller-supplied orphanTtlMs, keeping just inside it and deleting just outside it', async () => {
    const inside = freshRunId()
    const outside = freshRunId()
    const ttl = 10_000
    const insideNames = fileNames(inside)
    const outsideNames = fileNames(outside)
    const sandbox = fakeSandbox({
      files: [
        { name: insideNames.journal, mtimeMs: NOW - ttl + 1000 },
        { name: outsideNames.journal, mtimeMs: NOW - ttl },
      ],
    })
    const store = fakeStore({})

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
      orphanTtlMs: ttl,
    })

    // The cutoff is inclusive, matching `RunStore.listReclaimable`.
    expect(result.deleted).toEqual([outside])
    expect(result.kept).toEqual([
      {
        runId: inside,
        names: [insideNames.journal],
        reason: 'orphan-too-recent',
      },
    ])
  })
})

describe('pruneJournals — FAIL CLOSED when the age gate is unavailable', () => {
  /**
   * THE DATA-LOSS TEST.
   *
   * BusyBox `stat` without `-c` support prints its diagnostic to stderr and exits
   * **1 with EMPTY stdout**. An implementation that read that empty stdout as "no
   * files are newer than the cutoff" and inferred "therefore every file is old"
   * would delete every orphan in the directory — including the journal of a run
   * that started one millisecond ago and whose record has not been written yet,
   * which is the NORMAL state of a starting run.
   *
   * So: `{ kind: 'unavailable' }` must keep every age-gated entry, and it must be
   * distinguishable from an empty listing — the assertion below pins BOTH the
   * `ageGate` field and the exact keep reason, so treating `unavailable` as an
   * empty listing (`age-gate-missing-entry`) fails too, not just treating it as
   * "all old".
   */
  it('KEEPS an ancient orphan when the mtime listing is unavailable, while still deleting a terminal run in the same sweep', async () => {
    const orphan = freshRunId()
    const done = freshRunId()
    const sandbox = fakeSandbox({
      // Ancient on disk — an implementation that inferred "all old" from the
      // unavailable listing would happily delete it.
      files: [...ancientFiles(orphan, NOW), ...ancientFiles(done, NOW)],
      mtimeStdout: '', // exit 1, empty stdout, no witness line
    })
    const store = fakeStore({ [done]: 'completed' })

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
    })

    expect(result.ageGate).toBe('unavailable')
    // Paired deletion: the sweep was fully capable of deleting in this exact
    // configuration, so keeping the orphan is a decision, not a no-op.
    expect(result.deleted).toEqual([done])
    expect(result.kept).toEqual([
      {
        runId: orphan,
        names: [fileNames(orphan).journal, fileNames(orphan).stderr],
        reason: 'age-gate-unavailable',
      },
    ])
    expect(
      sandbox.execCommands.filter((command) => command.includes(orphan)),
    ).toEqual([])
  })

  it('KEEPS every orphan when the mtime listing has no witness line but DOES list files, while deleting a terminal run in the same sweep', async () => {
    const orphan = freshRunId()
    const done = freshRunId()
    const orphanNames = fileNames(orphan)
    const sandbox = fakeSandbox({
      files: [...ancientFiles(orphan, NOW), ...ancientFiles(done, NOW)],
      // File lines with NO witness line for the directory itself: `stat` did not
      // run as designed, so these lines are not a listing of anything.
      mtimeStdout: `1 ${DIR}/${orphanNames.journal}\n1 ${DIR}/${orphanNames.stderr}`,
    })
    const store = fakeStore({ [done]: 'completed' })

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
    })

    expect(result.ageGate).toBe('unavailable')
    expect(result.deleted).toEqual([done])
    expect(result.kept).toEqual([
      {
        runId: orphan,
        names: [orphanNames.journal, orphanNames.stderr],
        reason: 'age-gate-unavailable',
      },
    ])
  })

  it('KEEPS every orphan when the mtime exec itself rejects, while deleting a terminal run in the same sweep', async () => {
    const orphan = freshRunId()
    const done = freshRunId()
    const sandbox = fakeSandbox({
      files: [...ancientFiles(orphan, NOW), ...ancientFiles(done, NOW)],
    })
    const store = fakeStore({ [done]: 'completed' })
    const handle: SandboxHandle = {
      ...sandbox.handle,
      process: {
        ...sandbox.handle.process,
        exec: (command) =>
          command.startsWith('stat -c')
            ? Promise.reject(new Error('stat exploded'))
            : sandbox.handle.process.exec(command),
      },
    }

    const result = await pruneJournals({
      handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
    })

    expect(result.ageGate).toBe('unavailable')
    expect(result.deleted).toEqual([done])
    expect(result.kept.map((entry) => entry.reason)).toEqual([
      'age-gate-unavailable',
    ])
    expect(result.failures).toEqual([
      { stage: 'mtime-list', message: 'stat exploded' },
    ])
  })
})

describe('pruneJournals — de-duplication by runId', () => {
  it('treats a journal and its .err sidecar as ONE delete and ONE store lookup', async () => {
    const runId = freshRunId()
    const names = fileNames(runId)
    const sandbox = fakeSandbox({ files: freshFiles(runId, NOW) })
    const store = fakeStore({ [runId]: 'completed' })

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
    })

    expect(result.listed).toBe(2)
    expect(result.runIds).toBe(1)
    // Two files, one deletion — not two.
    expect(result.deleted).toEqual([runId])
    expect(store.asked).toEqual([runId])
    const removals = sandbox.execCommands.filter((command) =>
      command.startsWith('rm -f'),
    )
    expect(removals).toHaveLength(1)
    // The single `rm` covers both paths, exactly as journalCleanupCommand composes.
    expect(removals[0]).toContain(names.journal)
    expect(removals[0]).toContain(names.stderr)
  })
})

describe('pruneJournals — maxDeletes', () => {
  it('stops at maxDeletes and reports the remainder as kept', async () => {
    const a = freshRunId()
    const b = freshRunId()
    const sandbox = fakeSandbox({
      files: [...freshFiles(a, NOW), ...freshFiles(b, NOW)],
    })
    const store = fakeStore({ [a]: 'completed', [b]: 'completed' })

    const capped = await pruneJournals({
      handle: sandbox.handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
      maxDeletes: 1,
    })

    expect(capped.deleted).toHaveLength(1)
    expect(capped.kept).toHaveLength(1)
    expect(capped.kept[0]?.reason).toBe('max-deletes')

    // Paired: with the cap raised, the SAME two journals are both deleted, so
    // the single deletion above is the cap doing its job, not a keep decision.
    const fresh = fakeSandbox({
      files: [...freshFiles(a, NOW), ...freshFiles(b, NOW)],
    })
    const uncapped = await pruneJournals({
      handle: fresh.handle,
      runs: fakeStore({ [a]: 'completed', [b]: 'completed' }).runs,
      dir: DIR,
      now: NOW,
      maxDeletes: 2,
    })

    expect(uncapped.deleted).toEqual([a, b])
    expect(uncapped.kept).toEqual([])
  })

  it('defaults to DEFAULT_MAX_DELETES', () => {
    expect(DEFAULT_MAX_DELETES).toBeGreaterThan(0)
    expect(Number.isSafeInteger(DEFAULT_MAX_DELETES)).toBe(true)
  })
})

describe('pruneJournals — totality: it never rejects', () => {
  it('folds a rejecting rm into the result and keeps sweeping, deleting a later journal in the same sweep', async () => {
    const doomed = freshRunId()
    const fine = freshRunId()
    const sandbox = fakeSandbox({
      files: [...freshFiles(doomed, NOW), ...freshFiles(fine, NOW)],
      rm: (command) =>
        command.includes(doomed)
          ? Promise.reject(new Error('rm exploded'))
          : Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
    })
    const store = fakeStore({ [doomed]: 'completed', [fine]: 'completed' })

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
    })

    expect(result.deleted).toEqual([fine])
    expect(result.kept).toEqual([
      {
        runId: doomed,
        names: [fileNames(doomed).journal, fileNames(doomed).stderr],
        reason: 'delete-failed',
      },
    ])
    expect(result.failures).toEqual([
      { stage: 'delete', runId: doomed, message: 'rm exploded' },
    ])
  })

  it('treats a non-zero rm exit as a failed delete rather than a deletion', async () => {
    const runId = freshRunId()
    const sandbox = fakeSandbox({
      files: freshFiles(runId, NOW),
      rm: () => Promise.resolve({ stdout: '', stderr: '', exitCode: 1 }),
    })
    const store = fakeStore({ [runId]: 'completed' })

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
    })

    expect(result.deleted).toEqual([])
    expect(result.kept[0]?.reason).toBe('delete-failed')
    expect(result.failures).toEqual([
      { stage: 'delete', runId, message: 'rm exited 1' },
    ])
  })

  it('returns an empty sweep when the listing itself fails, and logs it', async () => {
    const sandbox = fakeSandbox({ files: [], listRejects: true })
    const { logger, calls } = captureLogger()

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: fakeStore({}).runs,
      dir: DIR,
      now: NOW,
      logger,
    })

    expect(result.listed).toBe(0)
    expect(result.deleted).toEqual([])
    expect(result.failures).toEqual([{ stage: 'list', message: 'ls exploded' }])
    expect(calls.some((call) => call.level === 'warn')).toBe(true)
  })

  it('reports an empty directory as an empty sweep with nothing deleted', async () => {
    const sandbox = fakeSandbox({ files: [] })

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: fakeStore({}).runs,
      dir: DIR,
      now: NOW,
    })

    expect(result).toEqual({
      listed: 0,
      runIds: 0,
      deleted: [],
      kept: [],
      ageGate: 'listed',
      failures: [],
    })
  })
})

describe('pruneJournals — shell only', () => {
  it('never uses handle.fs, and deletes through journalCleanupCommand', async () => {
    const runId = freshRunId()
    const names = fileNames(runId)
    const sandbox = fakeSandbox({ files: freshFiles(runId, NOW) })
    const store = fakeStore({ [runId]: 'completed' })

    const result = await pruneJournals({
      handle: sandbox.handle,
      runs: store.runs,
      dir: DIR,
      now: NOW,
    })

    // Every fs method rejects, so an `fs.remove` would have shown up as a failed
    // delete instead of a successful one.
    expect(result.deleted).toEqual([runId])
    expect(sandbox.fsCalls).toEqual([])
    expect(sandbox.execCommands).toEqual([
      `ls -1 '${DIR}' 2>/dev/null`,
      `stat -c '%Y %n' '${DIR}' '${DIR}'/* 2>/dev/null`,
      `rm -f '${DIR}/${names.journal}' '${DIR}/${names.stderr}'`,
    ])
  })
})

describe('pruneJournals — defaults', () => {
  it('exposes an orphan TTL long enough to clear the journal-before-record race', () => {
    expect(DEFAULT_ORPHAN_TTL_MS).toBeGreaterThanOrEqual(60_000)
    expect(Number.isSafeInteger(DEFAULT_ORPHAN_TTL_MS)).toBe(true)
  })

  it('sweeps the default journal directory when none is given', async () => {
    const sandbox = fakeSandbox({ files: [] })

    await pruneJournals({ handle: sandbox.handle, runs: fakeStore({}).runs })

    expect(sandbox.execCommands[0]).toBe(
      `ls -1 '/tmp/tanstack-runs' 2>/dev/null`,
    )
  })
})
