import { describe, expect, it } from 'vitest'
import { EventType, InMemoryRunStore } from '@tanstack/ai'
import { InMemoryLockStore } from '@tanstack/ai/locks'
import {
  journalCleanupCommand,
  journalExistsCommand,
  journalPaths,
  journaledCommand,
} from '../journal'
import { readJournalNdjson, startJournaledAgent } from '../runner'
import {
  JournalAttachUnavailableError,
  awaitAttachableJournal,
} from '../attach-preflight'
import {
  alignedIfAttaching,
  journalOptionsFor,
  resolveSandboxDurability,
} from '../durability'
import { sandboxRunDriver } from '../driver'
import { fenceDurability, withRunClaim } from '../claim'
import { chunkFingerprint, createRunScopedIdGen } from '../chunk-identity'
import type { SandboxRunDurability } from '../durability'
import type { JournalOptions } from '../runner'
import type { SandboxHandle } from '../contracts'
import type { LockStore } from '@tanstack/ai/locks'
import type { RunStore, StreamChunk, StreamDurability } from '@tanstack/ai'

export interface TakeoverConformanceConfig {
  /** Provider name, used in the describe title. */
  name: string
  /** Create a live sandbox plus its teardown. */
  createHandle: () => Promise<{
    handle: SandboxHandle
    dispose: () => Promise<void>
  }>
  unsupported?: { reason: string }
}

const CONFORMANCE_JOURNAL_DIR = '/tmp/tanstack-takeover-conformance'

/** Poll interval handed to providers that cannot follow a growing file. */
const POLL_INTERVAL_MS = 50

const FENCE_QUIET_MS = 25

const READ_BACKSTOP_MS = 90_000

let caseCounter = 0
function uniqueRunId(label: string): string {
  caseCounter += 1
  const suffix = Math.random().toString(36).slice(2, 8)
  return `tko-${label}-${Date.now()}-${caseCounter}-${suffix}`
}

interface ConformanceLog {
  log: StreamDurability
  /** Stored chunks, in append order. The transcript under test. */
  stored: () => Array<StreamChunk>
  /** `close()` calls — proof that `close` is NOT fenced. */
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
            const offset = `conf:${entries.length}`
            entries.push({ offset, chunk })
            return offset
          }),
        ),
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

const permissiveLocks: LockStore = {
  withLock: (_key, fn) => fn(new AbortController().signal),
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
      `takeover conformance: run ${runId} journal line is not an agent event: ${JSON.stringify(value)}`,
    )
  }
  const delta = value.delta
  if (typeof delta !== 'string') {
    throw new Error(
      `takeover conformance: run ${runId} journal line has a non-string delta: ${JSON.stringify(value)}`,
    )
  }
  return contentChunk(messageId, delta)
}

async function* translate(
  runId: string,
  lines: AsyncIterable<unknown>,
): AsyncIterable<StreamChunk> {
  const messageId = createRunScopedIdGen(runId)()
  for await (const line of lines) yield toChunk(runId, messageId, line)
}

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

function agentCommand(deltas: Array<string>, pauseAfter: number): string {
  const line = (delta: string): string => `'{"delta":"${delta}"}'`
  const head = deltas.slice(0, pauseAfter)
  const tail = deltas.slice(pauseAfter)
  const parts = [`printf '%s\\n' ${head.map(line).join(' ')}`]
  if (tail.length > 0) {
    // A real sleep, so the takeover below happens while the agent is genuinely
    // still writing rather than against a finished file.
    parts.push('sleep 2', `printf '%s\\n' ${tail.map(line).join(' ')}`)
  }
  return parts.join('; ')
}

/** Resolve durability through the production resolver, fresh or attaching. */
function durabilityFor(
  runs: RunStore,
  log: StreamDurability,
  attach: boolean,
): SandboxRunDurability {
  const resolved = resolveSandboxDurability({
    runs,
    durability: {
      adapter: log,
      journal: CONFORMANCE_JOURNAL_DIR,
      attach,
      pollIntervalMs: POLL_INTERVAL_MS,
    },
  })
  if (resolved === undefined) {
    throw new Error(
      'takeover conformance: resolveSandboxDurability returned undefined for a fully wired run',
    )
  }
  return resolved
}

function journalOptions(
  durability: SandboxRunDurability,
  runId: string,
): JournalOptions {
  const options = journalOptionsFor(durability, runId)
  if (options === undefined) {
    throw new Error(
      `takeover conformance: journalOptionsFor answered undefined for durable run ${runId}`,
    )
  }
  return options
}

/** A `'running'` record for `runId`, ready to be claimed. */
async function runningRun(
  runId: string,
  threadId: string,
): Promise<InMemoryRunStore> {
  const runs = new InMemoryRunStore()
  await runs.createOrResume({ runId, threadId, startedAt: Date.now() })
  return runs
}

function countingExec(handle: SandboxHandle): {
  handle: SandboxHandle
  execs: () => number
} {
  let execs = 0
  return {
    handle: {
      ...handle,
      process: {
        ...handle.process,
        exec: (command, options) => {
          execs += 1
          return handle.process.exec(command, options)
        },
      },
    },
    execs: () => execs,
  }
}

/** Poll `check` until it answers true, or fail with a message naming what never happened. */
async function waitUntil(
  check: () => Promise<boolean>,
  options: { timeoutMs: number; message: string },
): Promise<void> {
  const deadline = Date.now() + options.timeoutMs
  for (;;) {
    if (await check()) return
    if (Date.now() > deadline) {
      throw new Error(
        `takeover conformance: ${options.message} within ${options.timeoutMs}ms`,
      )
    }
    await sleep(25)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface Gate {
  promise: Promise<void>
  open: () => void
}

/** A one-shot gate, for sequencing two concurrent drivers deterministically. */
function gate(): Gate {
  let open = (): void => {}
  const promise = new Promise<void>((resolve) => {
    open = () => resolve()
  })
  return { promise, open }
}

function driverFor(input: {
  handle: SandboxHandle
  runs: RunStore
  locks: LockStore
  log: StreamDurability
  runId: string
  attach: boolean
  /** Awaited before the FIRST translated chunk is yielded, never after. */
  beforeFirstChunk?: () => Promise<void>
}): {
  driver: ReturnType<typeof sandboxRunDriver>
  /** True if any read this driver started was ended by the backstop clock. */
  backstopped: () => boolean
} {
  const durability = durabilityFor(input.runs, input.log, input.attach)
  // One entry per `drive` invocation, so a re-drive cannot hide a backstopped
  // read behind a healthy one.
  const backstops: Array<AbortSignal> = []
  const driver = sandboxRunDriver({
    request: new Request(
      `http://takeover.local/attach?runId=${encodeURIComponent(input.runId)}&offset=-1`,
    ),
    runs: input.runs,
    locks: input.locks,
    durability: () => input.log,
    fenceQuietMs: FENCE_QUIET_MS,
    drive: ({ runId, signal }) => {
      const backstop = AbortSignal.timeout(READ_BACKSTOP_MS)
      backstops.push(backstop)
      const bounded = AbortSignal.any([signal, backstop])
      const lines = readJournalNdjson(input.handle, {
        signal: bounded,
        journal: journalOptions(durability, runId),
      })
      const gated = input.beforeFirstChunk
      const source =
        gated === undefined
          ? lines
          : (async function* afterGate() {
              let first = true
              for await (const value of lines) {
                if (first) {
                  first = false
                  await gated()
                }
                yield value
              }
            })()
      return alignedIfAttaching(translate(runId, source), durability)
    },
  })
  return { driver, backstopped: () => backstops.some((s) => s.aborted) }
}

/** Exactly what core's `startRunDriver` does: claim, then pipe the drive. */
function takeOver(
  driver: ReturnType<typeof sandboxRunDriver>,
  input: { runs: RunStore; runId: string; threadId: string },
): Promise<unknown> {
  const { runs, runId, threadId } = input
  return driver.claim({ runs, locks: driver.locks, runId }, (claim) =>
    driver.pipe(driver.drive({ runId, threadId, signal: claim.signal }), {
      runId,
      threadId,
      signal: claim.signal,
    }),
  )
}

/** Best-effort removal of a case's journal files, through the shell (rule 3). */
async function cleanup(handle: SandboxHandle, runId: string): Promise<void> {
  try {
    await handle.process.exec(
      journalCleanupCommand(journalPaths(runId, CONFORMANCE_JOURNAL_DIR)),
    )
  } catch {}
}

export function runTakeoverConformance(
  config: TakeoverConformanceConfig,
): void {
  describe(`takeover conformance — ${config.name}`, () => {
    if (config.unsupported) {
      it.skip(`unsupported: ${config.unsupported.reason}`, () => {
        expect(true).toBe(true)
      })
      return
    }

    it(
      'delivers the run sequence exactly once when a second driver takes over mid-stream',
      { timeout: 180_000 },
      async () => {
        const { handle, dispose } = await config.createHandle()
        const runId = uniqueRunId('e2e')
        const threadId = `${runId}-t`
        const deltas = ['1', '2', '3', '4', '5', '6']
        const prefixLength = 3
        const expected = expectedTranscript(runId, deltas)
        const runs = await runningRun(runId, threadId)
        const log = conformanceLog()
        try {
          const fresh = durabilityFor(runs, log.log, false)

          const deliveredByFirst: Array<StreamChunk> = []
          const firstBackstop = AbortSignal.timeout(READ_BACKSTOP_MS)
          await withRunClaim(
            { runs, locks: new InMemoryLockStore(), runId },
            async (claim) => {
              const fenced = fenceDurability(log.log, claim, { runs })
              await startJournaledAgent(
                handle,
                agentCommand(deltas, prefixLength),
                { journal: journalOptions(fresh, runId) },
              )
              const lines = readJournalNdjson(handle, {
                signal: firstBackstop,
                journal: journalOptions(fresh, runId),
              })
              const translatedLines = translate(runId, lines)
              for await (const chunk of translatedLines) {
                await fenced.append([chunk])
                deliveredByFirst.push(chunk)
                // Breaking ends the reader's `tail` before this host walks away;
                // the AGENT keeps running, which is the whole premise.
                if (deliveredByFirst.length === prefixLength) break
              }
            },
          )
          expect({ backstopped: firstBackstop.aborted }).toEqual({
            backstopped: false,
          })
          expect(transcript(deliveredByFirst)).toEqual(
            transcript(expected.slice(0, prefixLength)),
          )

          // THE SUCCESSOR. Same runId, same journal, a fresh claim.
          const successor = driverFor({
            handle,
            runs,
            locks: new InMemoryLockStore(),
            log: log.log,
            runId,
            attach: true,
          })
          const record = await takeOver(successor.driver, {
            runs,
            runId,
            threadId,
          })

          expect({ backstopped: successor.backstopped() }).toEqual({
            backstopped: false,
          })

          expect(transcript(log.stored())).toEqual(transcript(expected))
          // Stated separately so a failure reads as what it is rather than as a
          // 9-vs-6 array diff.
          expect(log.stored()).toHaveLength(deltas.length)
          expect(transcript(log.stored().slice(prefixLength))).toEqual(
            transcript(expected.slice(prefixLength)),
          )

          const finalRecord = await runs.get(runId)
          expect(finalRecord?.status).toBe('completed')
          // The successor's claim, not the predecessor's: a hardcoded epoch
          // would read 1 here and every takeover would be fenced out.
          expect(finalRecord?.driverEpoch).toBe(2)
          expect(record).not.toBeUndefined()
        } finally {
          await cleanup(handle, runId)
          await dispose()
        }
      },
    )

    it(
      'fails an attach to an unknown runId with unknown-run, without waiting it out',
      { timeout: 120_000 },
      async () => {
        const { handle, dispose } = await config.createHandle()
        const runId = uniqueRunId('unknown')
        try {
          expect.hasAssertions()
          const probes = countingExec(handle)
          const error = await awaitAttachableJournal(probes.handle, {
            paths: journalPaths(runId, CONFORMANCE_JOURNAL_DIR),
            runId,
            runs: new InMemoryRunStore(),
            // Generous on purpose: were the store verdict skipped, this would
            // poll for the full 8s and the probe count below would catch it.
            waitMs: 8_000,
            probeIntervalMs: POLL_INTERVAL_MS,
          }).then(
            () => null,
            (reason: unknown) => reason,
          )
          expect(error).toBeInstanceOf(JournalAttachUnavailableError)
          if (!(error instanceof JournalAttachUnavailableError)) return
          expect(error.reason).toBe('unknown-run')
          expect(probes.execs()).toBe(1)
        } finally {
          await dispose()
        }
      },
    )

    it(
      'fails an attach to a terminal run whose journal is gone with terminal-run',
      { timeout: 120_000 },
      async () => {
        const { handle, dispose } = await config.createHandle()
        const runId = uniqueRunId('terminal')
        const threadId = `${runId}-t`
        try {
          expect.hasAssertions()
          const runs = await runningRun(runId, threadId)
          await runs.update(runId, { status: 'completed', finishedAt: 2 })
          const probes = countingExec(handle)
          const error = await awaitAttachableJournal(probes.handle, {
            paths: journalPaths(runId, CONFORMANCE_JOURNAL_DIR),
            runId,
            runs,
            waitMs: 8_000,
            probeIntervalMs: POLL_INTERVAL_MS,
          }).then(
            () => null,
            (reason: unknown) => reason,
          )
          expect(error).toBeInstanceOf(JournalAttachUnavailableError)
          if (!(error instanceof JournalAttachUnavailableError)) return
          expect(error.reason).toBe('terminal-run')
          // One `test -f`, then the record. Not a stopwatch — `countingExec`.
          expect(probes.execs()).toBe(1)
        } finally {
          await dispose()
        }
      },
    )

    it(
      'waits for a live run whose journal appears late — the legitimate race',
      { timeout: 120_000 },
      async () => {
        const { handle, dispose } = await config.createHandle()
        const runId = uniqueRunId('race')
        const threadId = `${runId}-t`
        const paths = journalPaths(runId, CONFORMANCE_JOURNAL_DIR)
        try {
          const runs = await runningRun(runId, threadId)
          const writer = sleep(400).then(() =>
            handle.process.exec(
              journaledCommand(`printf '{"delta":"1"}\\n'`, paths),
            ),
          )
          try {
            await awaitAttachableJournal(handle, {
              paths,
              runId,
              runs,
              // Comfortably longer than the write above; the per-test timeout is
              // what turns a never-resolving wait into a failure.
              waitMs: 20_000,
              probeIntervalMs: POLL_INTERVAL_MS,
            })
          } finally {
            await writer
          }
          // Resolving at all is the assertion; this pins the premise that it
          // resolved because the file really is there now.
          expect(
            (await handle.process.exec(journalExistsCommand(paths))).exitCode,
          ).toBe(0)
        } finally {
          await cleanup(handle, runId)
          await dispose()
        }
      },
    )

    it(
      'bounds the wait for a live run whose journal never appears, with journal-timeout',
      { timeout: 120_000 },
      async () => {
        const { handle, dispose } = await config.createHandle()
        const runId = uniqueRunId('timeout')
        const threadId = `${runId}-t`
        try {
          expect.hasAssertions()
          const runs = await runningRun(runId, threadId)
          const error = await awaitAttachableJournal(handle, {
            paths: journalPaths(runId, CONFORMANCE_JOURNAL_DIR),
            runId,
            runs,
            waitMs: 600,
            probeIntervalMs: POLL_INTERVAL_MS,
          }).then(
            () => null,
            (reason: unknown) => reason,
          )
          expect(error).toBeInstanceOf(JournalAttachUnavailableError)
          if (!(error instanceof JournalAttachUnavailableError)) return
          expect(error.reason).toBe('journal-timeout')
          expect(error.message).toContain('600ms')
        } finally {
          await dispose()
        }
      },
    )

    it(
      'lets the second of two concurrent drivers win, and the loser appends nothing at all',
      { timeout: 180_000 },
      async () => {
        const { handle, dispose } = await config.createHandle()
        const runId = uniqueRunId('fence')
        const threadId = `${runId}-t`
        const deltas = ['1', '2', '3']
        const expected = expectedTranscript(runId, deltas)
        try {
          const runs = await runningRun(runId, threadId)
          const log = conformanceLog()
          // One agent, one journal, two drivers reading it concurrently.
          await startJournaledAgent(
            handle,
            agentCommand(deltas, deltas.length),
            {
              journal: journalOptions(
                durabilityFor(runs, log.log, false),
                runId,
              ),
            },
          )

          const released = gate()
          const losingDriver = driverFor({
            handle,
            runs,
            locks: permissiveLocks,
            log: log.log,
            runId,
            attach: false,
            beforeFirstChunk: () => released.promise,
          })
          const loser = takeOver(losingDriver.driver, {
            runs,
            runId,
            threadId,
          })
          await waitUntil(
            async () => ((await runs.get(runId))?.driverEpoch ?? 0) >= 1,
            {
              timeoutMs: 30_000,
              message: `the first driver never claimed run ${runId}`,
            },
          )

          // The WINNER: claims at a higher epoch and drives the run to the end.
          const winner = driverFor({
            handle,
            runs,
            locks: permissiveLocks,
            log: log.log,
            runId,
            attach: true,
          })
          await takeOver(winner.driver, { runs, runId, threadId })
          expect({ backstopped: winner.backstopped() }).toEqual({
            backstopped: false,
          })
          expect(transcript(log.stored())).toEqual(transcript(expected))

          // Now let the superseded host try to write.
          released.open()
          await loser
          expect({ backstopped: losingDriver.backstopped() }).toEqual({
            backstopped: false,
          })

          expect(transcript(log.stored())).toEqual(transcript(expected))
          expect(
            log.stored().some((chunk) => chunk.type === EventType.RUN_ERROR),
          ).toBe(false)
          // And nothing lands on the RECORD either: `isTerminalRunStatus` must
          // not answer for the loser's view of a run the winner completed.
          const record = await runs.get(runId)
          expect(record?.status).toBe('completed')
          expect(record?.error).toBeUndefined()
          expect(record?.driverEpoch).toBe(2)
          expect(log.closes()).toBe(2)
        } finally {
          await cleanup(handle, runId)
          await dispose()
        }
      },
    )

    it(
      "deletes a terminal run's journal, and a later attach reports terminal-run instead of hanging",
      { timeout: 180_000 },
      async () => {
        const { handle, dispose } = await config.createHandle()
        const runId = uniqueRunId('cleanup')
        const threadId = `${runId}-t`
        const deltas = ['1', '2']
        const paths = journalPaths(runId, CONFORMANCE_JOURNAL_DIR)
        try {
          const runs = await runningRun(runId, threadId)
          const log = conformanceLog()
          const fresh = durabilityFor(runs, log.log, false)
          await startJournaledAgent(
            handle,
            agentCommand(deltas, deltas.length),
            { journal: journalOptions(fresh, runId) },
          )
          const seen: Array<StreamChunk> = []
          const backstop = AbortSignal.timeout(READ_BACKSTOP_MS)
          const takeoverLines = translate(
            runId,
            readJournalNdjson(handle, {
              signal: backstop,
              journal: journalOptions(fresh, runId),
            }),
          )
          for await (const chunk of takeoverLines) {
            seen.push(chunk)
          }
          expect({ backstopped: backstop.aborted }).toEqual({
            backstopped: false,
          })
          // Reaching the sentinel is what makes the run terminal, and it is the
          // precondition for the deletion below.
          expect(transcript(seen)).toEqual(
            transcript(expectedTranscript(runId, deltas)),
          )

          const journalProbe = await handle.process.exec(
            journalExistsCommand(paths),
          )
          const stderrProbe = await handle.process.exec(
            journalExistsCommand({ ...paths, journal: paths.stderr }),
          )
          expect({
            journalDeleted: journalProbe.exitCode !== 0,
            stderrSidecarDeleted: stderrProbe.exitCode !== 0,
          }).toEqual({ journalDeleted: true, stderrSidecarDeleted: true })

          await runs.update(runId, {
            status: 'completed',
            finishedAt: Date.now(),
          })
          const probes = countingExec(handle)
          const error = await awaitAttachableJournal(probes.handle, {
            paths,
            runId,
            runs,
            waitMs: 8_000,
            probeIntervalMs: POLL_INTERVAL_MS,
          }).then(
            () => null,
            (reason: unknown) => reason,
          )
          expect(error).toBeInstanceOf(JournalAttachUnavailableError)
          if (!(error instanceof JournalAttachUnavailableError)) return
          expect(error.reason).toBe('terminal-run')
          expect(probes.execs()).toBe(1)
        } finally {
          await cleanup(handle, runId)
          await dispose()
        }
      },
    )
  })
}
