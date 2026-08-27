import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { EventType, InMemoryRunStore } from '@tanstack/ai'
import { InMemoryLockStore } from '@tanstack/ai/locks'
import {
  EXIT_SENTINEL_KEY,
  decodeJournalRunId,
  exitSentinelLine,
  journalCleanupCommand,
  journalExistsCommand,
  journalListCommand,
  journalMtimeListCommand,
  journalPaths,
  journalReadCommand,
  journalStderrReadCommand,
  journaledCommand,
  parseJournalMtimeListing,
} from '../journal'
import { journalReadStrategy, readJournal } from '../journal-reader'
import { pruneJournals } from '../journal-sweep'
import { probeRunExit, reapDetachedRuns } from '../reap'
import { readJournalNdjson } from '../runner'
import { chunkFingerprint, createRunScopedIdGen } from '../chunk-identity'
import { waitForJournal } from './journal-conformance'
import type { JournalPaths } from '../journal'
import type { SandboxHandle } from '../contracts'
import type { RunStore, StreamChunk, StreamDurability } from '@tanstack/ai'

export interface ReaperConformanceConfig {
  /** Provider name, used in the describe title. */
  name: string
  /** Create a live sandbox plus its teardown. */
  createHandle: () => Promise<{
    handle: SandboxHandle
    dispose: () => Promise<void>
  }>
  unsupported?: { reason: string }
  followUnsupported?: { reason: string }
  mtimeListUnsupported?: { reason: string }
}

/** Poll interval handed to providers that cannot follow a growing file. */
const POLL_INTERVAL_MS = 50

const FENCE_QUIET_MS = 25

const READ_BACKSTOP_MS = 90_000

/** Long enough that nothing in this suite is ever classified as expired. */
const NEVER_EXPIRES_MS = 60 * 60 * 1000

function caseDir(): string {
  return `/tmp/tanstack-reaper-conformance-${randomUUID()}`
}

function uniqueRunId(label: string): string {
  return `rp-${label}-${randomUUID()}`
}

function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/** Remove a case's journal directory and everything in it. Best effort. */
async function removeDir(handle: SandboxHandle, dir: string): Promise<void> {
  try {
    await handle.process.exec(`rm -rf ${quote(dir)}`)
  } catch {}
}

async function fileExists(
  handle: SandboxHandle,
  path: string,
): Promise<boolean> {
  const probe = await handle.process.exec(
    journalExistsCommand({ journal: path }),
  )
  return probe.exitCode === 0
}

/** Filename as `ls -1` reports it, for a path inside `dir`. */
function basename(dir: string, path: string): string {
  return path.slice(dir.length + 1)
}

function emitLines(deltas: Array<string>): string {
  return `printf '%s\\n' ${deltas.map((delta) => `'{"delta":"${delta}"}'`).join(' ')}`
}

async function runAgent(
  handle: SandboxHandle,
  paths: JournalPaths,
  deltas: Array<string>,
): Promise<void> {
  await handle.process.exec(journaledCommand(emitLines(deltas), paths))
}

/** `ls -1` output as a list of names. */
async function listNames(
  handle: SandboxHandle,
  dir: string,
): Promise<Array<string>> {
  const listing = await handle.process.exec(journalListCommand(dir))
  return listing.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/** Decode the base64 frame a bounded journal read produces. */
function decodeJournalRead(stdout: string): string {
  return Buffer.from(stdout.replace(/\s+/g, ''), 'base64').toString('utf8')
}

async function mtimeListing(
  handle: SandboxHandle,
  dir: string,
): Promise<{ stdout: string; entries: Map<string, number> }> {
  const probe = await handle.process.exec(journalMtimeListCommand(dir))
  const parsed = parseJournalMtimeListing(probe.stdout, dir)
  if (parsed.kind !== 'listed') {
    throw new Error(
      `reaper conformance: the mtime listing for ${dir} came back unavailable — ` +
        `stat -c '%Y %n' produced no witness line. stdout: ${JSON.stringify(probe.stdout)}`,
    )
  }
  return {
    stdout: probe.stdout,
    entries: new Map(
      parsed.entries.map((entry) => [entry.name, entry.mtimeMs]),
    ),
  }
}

function hasWitnessLine(stdout: string, dir: string): boolean {
  return stdout
    .split('\n')
    .some((line) => /^\d+ (?<path>.+)$/.exec(line.trim())?.[1] === dir)
}

/** Read one file's mtime out of a listing, loudly when it is missing. */
function mtimeOf(entries: Map<string, number>, name: string): number {
  const mtimeMs = entries.get(name)
  if (mtimeMs === undefined) {
    throw new Error(
      `reaper conformance: ${name} has no mtime in the stat listing, so the age gate cannot be exercised`,
    )
  }
  return mtimeMs
}

interface ConformanceLog {
  log: StreamDurability
  stored: () => Array<StreamChunk>
  closes: () => number
}

function conformanceLog(): ConformanceLog {
  const entries: Array<{ offset: string; chunk: StreamChunk }> = []
  let closes = 0
  return {
    log: {
      resumeFrom: () => null,
      append: (chunks) =>
        Promise.resolve(
          chunks.map((chunk) => {
            const offset = `reap:${entries.length}`
            entries.push({ offset, chunk })
            return offset
          }),
        ),
      // Nothing here tails the log — every assertion reads the appended
      // transcript, and a `read` would park until `close()` (see `align.ts`).
      read: () => (async function* empty() {})(),
      close: () => {
        closes += 1
        return Promise.resolve()
      },
      snapshot: () => Promise.resolve(entries.map((entry) => ({ ...entry }))),
    },
    stored: () => entries.map((entry) => entry.chunk),
    closes: () => closes,
  }
}

interface CountingRunStore {
  runs: RunStore
  updates: () => number
}

function countingRunStore(inner: InMemoryRunStore): CountingRunStore {
  let updates = 0
  return {
    runs: {
      createOrResume: (...args) => inner.createOrResume(...args),
      update: (...args) => {
        updates += 1
        return inner.update(...args)
      },
      get: (...args) => inner.get(...args),
      listByThread: (...args) => inner.listByThread(...args),
      listReclaimable: (...args) => inner.listReclaimable(...args),
      findActiveRun: (...args) => inner.findActiveRun(...args),
    },
    updates: () => updates,
  }
}

/** The event a journal line translates into. `timestamp` is excluded from `chunkFingerprint`. */
function contentChunk(messageId: string, delta: string): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta,
    timestamp: Date.now(),
  }
}

function toChunk(
  runId: string,
  messageId: string,
  value: unknown,
): StreamChunk {
  if (typeof value !== 'object' || value === null || !('delta' in value)) {
    throw new Error(
      `reaper conformance: run ${runId} journal line is not an agent event: ${JSON.stringify(value)}`,
    )
  }
  const delta = value.delta
  if (typeof delta !== 'string') {
    throw new Error(
      `reaper conformance: run ${runId} journal line has a non-string delta: ${JSON.stringify(value)}`,
    )
  }
  return contentChunk(messageId, delta)
}

/** Deterministic translator: re-reading the journal reproduces the same chunks. */
async function* translate(
  runId: string,
  lines: AsyncIterable<unknown>,
): AsyncIterable<StreamChunk> {
  const messageId = createRunScopedIdGen(runId)()
  for await (const line of lines) yield toChunk(runId, messageId, line)
}

/** A comparable transcript: each chunk reduced to its fingerprint. */
function transcript(chunks: Array<StreamChunk>): Array<string> {
  return chunks.map(chunkFingerprint)
}

/** The chunks a run over `deltas` must deliver, exactly once and in order. */
function expectedTranscript(
  runId: string,
  deltas: Array<string>,
): Array<StreamChunk> {
  const messageId = createRunScopedIdGen(runId)()
  return deltas.map((delta) => contentChunk(messageId, delta))
}

function driveFromJournal(
  handle: SandboxHandle,
  dir: string,
): {
  drive: (input: {
    runId: string
    threadId: string
    signal: AbortSignal
  }) => AsyncIterable<StreamChunk>
  /** True if any read this drive started was ended by the backstop clock. */
  backstopped: () => boolean
} {
  // One entry per `drive` invocation, so a sweep that drives more than one run
  // cannot hide a backstopped read behind a healthy one.
  const backstops: Array<AbortSignal> = []
  return {
    drive: ({ runId, signal }) => {
      // Not the assertion — see {@link READ_BACKSTOP_MS}. `backstopped()` is what
      // proves the clock was not what ended the read.
      const backstop = AbortSignal.timeout(READ_BACKSTOP_MS)
      backstops.push(backstop)
      return translate(
        runId,
        readJournalNdjson(handle, {
          signal: AbortSignal.any([signal, backstop]),
          journal: { runId, dir, pollIntervalMs: POLL_INTERVAL_MS },
        }),
      )
    },
    backstopped: () => backstops.some((s) => s.aborted),
  }
}

/** A `'running'`, DETACHED record — the shape `listReclaimable` selects on. */
async function detachedRun(
  store: RunStore,
  runId: string,
  threadId: string,
  detachedSince: number,
): Promise<void> {
  await store.createOrResume({ runId, threadId, startedAt: Date.now() })
  await store.update(runId, { detachedSince })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function runReaperConformance(config: ReaperConformanceConfig): void {
  describe(`reaper conformance — ${config.name}`, () => {
    if (config.unsupported) {
      it.skip(`unsupported: ${config.unsupported.reason}`, () => {
        expect(true).toBe(true)
      })
      return
    }

    it(
      "deletes a terminal run's journal AND its .err sidecar, while a running run's journal survives the same sweep",
      { timeout: 60_000 },
      async () => {
        const { handle, dispose } = await config.createHandle()
        const dir = caseDir()
        const terminalId = uniqueRunId('terminal')
        const liveId = uniqueRunId('live')
        const terminal = journalPaths(terminalId, dir)
        const live = journalPaths(liveId, dir)
        try {
          await runAgent(handle, terminal, ['1'])
          await runAgent(handle, live, ['1'])
          // Premise: all four files really exist before the sweep, otherwise
          // "deleted" below would be indistinguishable from "never written".
          expect({
            terminalJournal: await fileExists(handle, terminal.journal),
            terminalSidecar: await fileExists(handle, terminal.stderr),
            liveJournal: await fileExists(handle, live.journal),
          }).toEqual({
            terminalJournal: true,
            terminalSidecar: true,
            liveJournal: true,
          })

          const runs = new InMemoryRunStore()
          await runs.createOrResume({
            runId: terminalId,
            threadId: `${terminalId}-t`,
            startedAt: Date.now(),
          })
          await runs.update(terminalId, {
            status: 'completed',
            finishedAt: Date.now(),
          })
          await runs.createOrResume({
            runId: liveId,
            threadId: `${liveId}-t`,
            startedAt: Date.now(),
          })

          const result = await pruneJournals({ handle, runs, dir })
          expect(result.deleted).toEqual([terminalId])
          expect(result.failures).toEqual([])
          expect(result.kept).toEqual([
            { runId: liveId, names: expect.any(Array), reason: 'non-terminal' },
          ])

          // The files, through the shell. A sweep that reported a deletion it did
          // not perform passes every assertion above and fails here.
          expect({
            terminalJournal: await fileExists(handle, terminal.journal),
            terminalSidecar: await fileExists(handle, terminal.stderr),
            liveJournal: await fileExists(handle, live.journal),
            liveSidecar: await fileExists(handle, live.stderr),
          }).toEqual({
            terminalJournal: false,
            terminalSidecar: false,
            liveJournal: true,
            liveSidecar: true,
          })
        } finally {
          await removeDir(handle, dir)
          await dispose()
        }
      },
    )

    it(
      'sweeps the same terminal run twice without a failure, and rm -f of an already-absent journal exits 0',
      { timeout: 60_000 },
      async () => {
        const { handle, dispose } = await config.createHandle()
        const dir = caseDir()
        const runId = uniqueRunId('twice')
        const paths = journalPaths(runId, dir)
        try {
          await runAgent(handle, paths, ['1'])
          const runs = new InMemoryRunStore()
          await runs.createOrResume({
            runId,
            threadId: `${runId}-t`,
            startedAt: Date.now(),
          })
          await runs.update(runId, {
            status: 'completed',
            finishedAt: Date.now(),
          })

          const first = await pruneJournals({ handle, runs, dir })
          expect(first.deleted).toEqual([runId])

          // The second sweep sees an empty directory. It must report nothing to
          // do rather than a failure — a cron runs this every tick forever.
          const second = await pruneJournals({ handle, runs, dir })
          expect({
            listed: second.listed,
            runIds: second.runIds,
            deleted: second.deleted,
            kept: second.kept,
            failures: second.failures,
          }).toEqual({
            listed: 0,
            runIds: 0,
            deleted: [],
            kept: [],
            failures: [],
          })

          const rerun = await handle.process.exec(journalCleanupCommand(paths))
          expect(rerun.exitCode).toBe(0)
        } finally {
          await removeDir(handle, dir)
          await dispose()
        }
      },
    )

    it(
      'leaves a filename it cannot decode alone, while still sweeping the terminal run beside it',
      { timeout: 60_000 },
      async () => {
        const { handle, dispose } = await config.createHandle()
        const dir = caseDir()
        const runId = uniqueRunId('undecodable')
        const paths = journalPaths(runId, dir)
        const strayName = 'reaper-conformance-stray_1.ndjson'
        const strayPath = `${dir}/${strayName}`
        try {
          await runAgent(handle, paths, ['1'])
          await handle.process.exec(
            `printf 'not a journal\\n' >> ${quote(strayPath)}`,
          )
          expect(await fileExists(handle, strayPath)).toBe(true)
          expect(decodeJournalRunId(strayName).kind).toBe('malformed')

          const runs = new InMemoryRunStore()
          await runs.createOrResume({
            runId,
            threadId: `${runId}-t`,
            startedAt: Date.now(),
          })
          await runs.update(runId, {
            status: 'completed',
            finishedAt: Date.now(),
          })

          const result = await pruneJournals({ handle, runs, dir })
          expect(result.deleted).toEqual([runId])
          expect(result.kept).toEqual([
            { names: [strayName], reason: 'undecodable-name' },
          ])
          expect(result.failures).toEqual([])
          expect({
            strayKept: await fileExists(handle, strayPath),
            journalDeleted: !(await fileExists(handle, paths.journal)),
          }).toEqual({ strayKept: true, journalDeleted: true })
        } finally {
          await removeDir(handle, dir)
          await dispose()
        }
      },
    )

    const mtimeSkip = config.mtimeListUnsupported
    const itMtime = (title: string, timeout: number, fn: () => Promise<void>) =>
      it(
        mtimeSkip ? `${title} (unsupported: ${mtimeSkip.reason})` : title,
        { timeout, skip: Boolean(mtimeSkip) },
        fn,
      )

    itMtime(
      "emits stat's self-witness line for a populated directory, so the age gate is usable",
      60_000,
      async () => {
        const { handle, dispose } = await config.createHandle()
        const dir = caseDir()
        const runId = uniqueRunId('witness')
        const paths = journalPaths(runId, dir)
        try {
          await runAgent(handle, paths, ['1'])
          const listing = await mtimeListing(handle, dir)
          expect(hasWitnessLine(listing.stdout, dir)).toBe(true)
          expect([...listing.entries.keys()].sort()).toEqual(
            [basename(dir, paths.journal), basename(dir, paths.stderr)].sort(),
          )
          const listingValues = listing.entries.values()
          for (const mtimeMs of listingValues) {
            expect(Math.abs(Date.now() - mtimeMs)).toBeLessThan(120_000)
          }
        } finally {
          await removeDir(handle, dir)
          await dispose()
        }
      },
    )

    itMtime(
      'reports an EMPTY journal directory as witness-only rather than unavailable',
      60_000,
      async () => {
        const { handle, dispose } = await config.createHandle()
        const dir = caseDir()
        try {
          await handle.process.exec(`mkdir -p ${quote(dir)}`)
          const listing = await mtimeListing(handle, dir)
          expect(hasWitnessLine(listing.stdout, dir)).toBe(true)
          expect([...listing.entries.keys()]).toEqual([])

          const result = await pruneJournals({
            handle,
            runs: new InMemoryRunStore(),
            dir,
          })
          expect({
            listed: result.listed,
            ageGate: result.ageGate,
            deleted: result.deleted,
            failures: result.failures,
          }).toEqual({
            listed: 0,
            ageGate: 'listed',
            deleted: [],
            failures: [],
          })
        } finally {
          await removeDir(handle, dir)
          await dispose()
        }
      },
    )

    itMtime(
      'keeps an orphan younger than orphanTtlMs and sweeps the older one, in the same pass',
      120_000,
      async () => {
        const { handle, dispose } = await config.createHandle()
        const dir = caseDir()
        const olderId = uniqueRunId('older')
        const newerId = uniqueRunId('newer')
        const older = journalPaths(olderId, dir)
        const newer = journalPaths(newerId, dir)
        try {
          await runAgent(handle, older, ['1'])
          // `stat -c '%Y'` is second-granular, so the two runs must be more than
          // one second apart for their ages to be distinguishable at all.
          await sleep(2_500)
          await runAgent(handle, newer, ['1'])

          const listing = await mtimeListing(handle, dir)
          const newestOf = (paths: JournalPaths): number =>
            Math.max(
              mtimeOf(listing.entries, basename(dir, paths.journal)),
              mtimeOf(listing.entries, basename(dir, paths.stderr)),
            )
          const olderMtime = newestOf(older)
          const newerMtime = newestOf(newer)
          expect(newerMtime - olderMtime).toBeGreaterThanOrEqual(1_000)

          const now = Date.now()
          const cutoff = olderMtime + Math.floor((newerMtime - olderMtime) / 2)
          // NEITHER run is in the store, so both take the orphan arm and only the
          // age gate decides between them.
          const result = await pruneJournals({
            handle,
            runs: new InMemoryRunStore(),
            dir,
            now,
            orphanTtlMs: now - cutoff,
          })
          expect(result.ageGate).toBe('listed')
          expect(result.deleted).toEqual([olderId])
          expect(result.kept).toEqual([
            {
              runId: newerId,
              names: expect.any(Array),
              reason: 'orphan-too-recent',
            },
          ])
          expect(result.failures).toEqual([])
          expect({
            olderJournal: await fileExists(handle, older.journal),
            olderSidecar: await fileExists(handle, older.stderr),
            newerJournal: await fileExists(handle, newer.journal),
            newerSidecar: await fileExists(handle, newer.stderr),
          }).toEqual({
            olderJournal: false,
            olderSidecar: false,
            newerJournal: true,
            newerSidecar: true,
          })
        } finally {
          await removeDir(handle, dir)
          await dispose()
        }
      },
    )

    it(
      'finalizes a detached run whose agent reached its sentinel, and its transcript lands',
      { timeout: 120_000 },
      async () => {
        const { handle, dispose } = await config.createHandle()
        const dir = caseDir()
        const runId = uniqueRunId('finalize')
        const threadId = `${runId}-t`
        const deltas = ['1', '2', '3']
        const paths = journalPaths(runId, dir)
        try {
          const runs = new InMemoryRunStore()
          const detachedSince = Date.now()
          await detachedRun(runs, runId, threadId, detachedSince)
          await runAgent(handle, paths, deltas)

          expect(await probeRunExit({ handle, runId, dir })).toEqual({
            state: 'finished',
            exitCode: 0,
          })

          const log = conformanceLog()
          const journalDrive = driveFromJournal(handle, dir)
          const result = await reapDetachedRuns({
            runs,
            locks: new InMemoryLockStore(),
            durability: () => log.log,
            hasFinished: (record) =>
              probeRunExit({ handle, runId: record.runId, dir }),
            drive: journalDrive.drive,
            now: Date.now(),
            detachedRunTtlMs: NEVER_EXPIRES_MS,
            fenceQuietMs: FENCE_QUIET_MS,
          })

          expect({ backstopped: journalDrive.backstopped() }).toEqual({
            backstopped: false,
          })
          expect({
            considered: result.considered,
            probed: result.probed,
            finalized: result.outcomes.finalized,
          }).toEqual({ considered: 1, probed: 1, finalized: 1 })
          expect(result.runs).toEqual([
            { runId, outcome: 'finalized', status: 'completed', exitCode: 0 },
          ])
          // The transcript, element for element — the reaper's whole purpose is
          // that the run a nobody watched still ends up saved.
          expect(transcript(log.stored())).toEqual(
            transcript(expectedTranscript(runId, deltas)),
          )
          const record = await runs.get(runId)
          expect(record?.status).toBe('completed')
          // NEVER CLEARED: `detachedSince` is what the next sweep selects on, and
          // clearing it would reset the TTL on every pass.
          expect(record?.detachedSince).toBe(detachedSince)
        } finally {
          await removeDir(handle, dir)
          await dispose()
        }
      },
    )

    it(
      'reports a still-producing detached run as producing and leaves it completely untouched',
      { timeout: 120_000 },
      async () => {
        const { handle, dispose } = await config.createHandle()
        const dir = caseDir()
        const runId = uniqueRunId('producing')
        const threadId = `${runId}-t`
        const paths = journalPaths(runId, dir)
        const store = countingRunStore(new InMemoryRunStore())
        const agent = await handle.process.spawn(
          journaledCommand(`${emitLines(['1'])}; sleep 30`, paths),
        )
        try {
          const detachedSince = Date.now()
          await detachedRun(store.runs, runId, threadId, detachedSince)
          await waitForJournal(handle, paths)
          const read = await handle.process.exec(journalReadCommand(paths, 0))
          const text = decodeJournalRead(read.stdout)
          // Producing, provably: the first line is there and the sentinel is not.
          expect(text).toContain('{"delta":"1"}')
          expect(text).not.toContain('__exit')
          expect(await probeRunExit({ handle, runId, dir })).toEqual({
            state: 'producing',
          })

          const log = conformanceLog()
          let driveCalled = false
          let durabilityCalls = 0
          const result = await reapDetachedRuns({
            runs: store.runs,
            locks: new InMemoryLockStore(),
            durability: () => {
              durabilityCalls += 1
              return log.log
            },
            hasFinished: (record) =>
              probeRunExit({ handle, runId: record.runId, dir }),
            drive: () => {
              driveCalled = true
              return (async function* never() {})()
            },
            now: Date.now(),
            detachedRunTtlMs: NEVER_EXPIRES_MS,
            fenceQuietMs: FENCE_QUIET_MS,
          })

          expect(result.runs).toEqual([{ runId, outcome: 'producing' }])
          expect({
            considered: result.considered,
            probed: result.probed,
            producing: result.outcomes.producing,
            finalized: result.outcomes.finalized,
            expired: result.outcomes.expired,
            failed: result.outcomes.failed,
          }).toEqual({
            considered: 1,
            probed: 1,
            producing: 1,
            finalized: 0,
            expired: 0,
            failed: 0,
          })

          const record = await store.runs.get(runId)
          expect({
            driveCalled,
            durabilityCalls,
            appended: log.stored().length,
            closes: log.closes(),
            updatesAfterSetup: store.updates() - 1,
            status: record?.status,
            detachedSince: record?.detachedSince,
            driverEpoch: record?.driverEpoch,
          }).toEqual({
            driveCalled: false,
            durabilityCalls: 0,
            appended: 0,
            closes: 0,
            updatesAfterSetup: 0,
            status: 'running',
            detachedSince,
            driverEpoch: undefined,
          })
        } finally {
          // The agent outlives the sweep on purpose; reap it here so no `sleep`
          // survives the case.
          try {
            await agent.kill()
          } catch {
            // Already gone, or a provider whose sandbox teardown covers it.
          }
          await removeDir(handle, dir)
          await dispose()
        }
      },
    )

    it(
      'round-trips a shell-hostile runId through encode, journal, follow, sidecar read, list, decode and delete without executing any of it' +
        (config.followUnsupported === undefined
          ? ''
          : ` (follow read omitted: ${config.followUnsupported.reason})`),
      { timeout: 120_000 },
      async () => {
        const { handle, dispose } = await config.createHandle()
        const dir = caseDir()
        const nonce = randomUUID().slice(0, 8)
        // The canary lives OUTSIDE `dir` so the teardown `rm -rf` cannot be what
        // makes the final assertion pass.
        const canary = `/tmp/rp-pwn-${nonce}`
        const runId = `rp-a;touch ${canary};b c/d$(x)-${nonce}`
        const threadId = `${runId}-t`
        const paths = journalPaths(runId, dir)
        const journalName = basename(dir, paths.journal)
        try {
          await handle.process.exec(
            journaledCommand(
              `${emitLines(['1'])}; printf 'boom\\n' 1>&2`,
              paths,
            ),
          )
          expect(await fileExists(handle, canary)).toBe(false)
          expect(await probeRunExit({ handle, runId, dir })).toEqual({
            state: 'finished',
            exitCode: 0,
          })
          // The encoding is what bought that: the filename carries no character
          // a shell can act on, and it stays inside the journal directory.
          expect(journalName).toMatch(/^[A-Za-z0-9._-]+\.ndjson$/)
          expect(paths.journal.startsWith(`${dir}/`)).toBe(true)

          expect(journalReadStrategy(handle)).toBe(
            config.followUnsupported === undefined ? 'follow' : 'poll',
          )
          if (config.followUnsupported === undefined) {
            const followed: Array<string> = []
            const backstop = AbortSignal.timeout(READ_BACKSTOP_MS)
            const journalLines = readJournal(handle, {
              paths,
              fromByte: 0,
              strategy: 'follow',
              signal: backstop,
            })
            for await (const line of journalLines) {
              followed.push(line.line)
              // The agent has already reached its sentinel, so this arrives; a
              // `tail -f` never ends on its own.
              if (line.line.includes(EXIT_SENTINEL_KEY)) break
            }
            expect({ backstopped: backstop.aborted }).toEqual({
              backstopped: false,
            })
            expect(followed).toEqual([
              '{"delta":"1"}',
              exitSentinelLine(paths, 0),
            ])
            expect(await fileExists(handle, canary)).toBe(false)
          }

          // The stderr SIDECAR read, which no other conformance case reaches at
          // all. Same hostile id, same canary, one `exec`.
          const sidecar = await handle.process.exec(
            journalStderrReadCommand(paths),
          )
          expect(decodeJournalRead(sidecar.stdout)).toBe('boom\n')
          expect(await fileExists(handle, canary)).toBe(false)

          // encode → journal → list → decode: the sweep's actual path back to a
          // runId, over a real `ls -1`.
          const names = await listNames(handle, dir)
          expect(names.sort()).toEqual(
            [journalName, basename(dir, paths.stderr)].sort(),
          )
          expect(decodeJournalRunId(journalName)).toEqual({
            kind: 'runId',
            runId,
          })

          const runs = new InMemoryRunStore()
          await runs.createOrResume({ runId, threadId, startedAt: Date.now() })
          await runs.update(runId, {
            status: 'completed',
            finishedAt: Date.now(),
          })
          const result = await pruneJournals({ handle, runs, dir })
          expect(result.deleted).toEqual([runId])
          expect(result.failures).toEqual([])
          expect({
            journalDeleted: !(await fileExists(handle, paths.journal)),
            sidecarDeleted: !(await fileExists(handle, paths.stderr)),
            canaryAbsent: !(await fileExists(handle, canary)),
          }).toEqual({
            journalDeleted: true,
            sidecarDeleted: true,
            canaryAbsent: true,
          })
        } finally {
          await handle.process
            .exec(`rm -f ${quote(canary)}`)
            .catch(() => undefined)
          await removeDir(handle, dir)
          await dispose()
        }
      },
    )
  })
}
