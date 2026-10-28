/**
 * Provider conformance for TAKEOVER: a second driver picking up a run whose
 * first driver died, against a REAL sandbox.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE UNIT TESTS. Every takeover unit test in
 * this package drives fakes — a scripted `spawn`, a `test -f` that answers from
 * a boolean, a log that is an array. Fakes model what we believe the shell and
 * the filesystem do, and on this feature that belief has been wrong three times:
 * `base64` delivers zero bytes on a live pipe, `tail -f` on a missing file exits
 * instead of waiting, and a provider's `kill` does not always reap a grandchild.
 * Each one passed every fake. So the four properties a takeover actually rests
 * on are asserted here through a provider's real `spawn`/`exec` against a real
 * journal file:
 *
 * 1. **The delivered sequence is the run's sequence, with no duplicated
 *    prefix.** Asserted as a TRANSCRIPT, never as "chunks arrived": a takeover
 *    that replays the whole journal and re-appends everything satisfies the weak
 *    assertion while showing the user the entire run twice. That is the exact
 *    failure `alignToStoredLog` exists to prevent, and the only assertion that
 *    can see it is one that compares the stored log to the expected sequence
 *    element for element.
 * 2. **The attach preflight decides, or fails, but never hangs.** It probes with
 *    the provider's real `exec` (`test -f`), which is the layer where a fake's
 *    assumptions break, and its three verdicts (`unknown-run`, `terminal-run`,
 *    `journal-timeout`) plus the legitimate late-journal race are all timing
 *    against a real filesystem.
 * 3. **The epoch fence and its latch hold under real concurrency.** Two drivers
 *    reading one real journal at once: the second wins, the first appends
 *    NOTHING — not even `pipeToRunLog`'s recovery `RUN_ERROR` — and cannot
 *    terminalize the record out from under the live successor.
 * 4. **A terminal run's journal is deleted, and a later attach says so.** The
 *    deletion is a real `rm` of real files, and the follow-up attach must report
 *    `terminal-run` rather than tailing the file that `journalFollowCommand`
 *    would helpfully re-create.
 *
 * WHAT IS REAL HERE. The provider (its `spawn`, `exec`, and shell), the journal
 * (a real NDJSON file the agent's stdout is redirected into), the agent (a real
 * process writing real lines with a real pause in the middle), the reader
 * (`readJournalNdjson`, including the follow/poll strategy split and the attach
 * preflight), the alignment (`alignedIfAttaching` over the real
 * `resolveSandboxDurability` output), the claim and BOTH fences
 * (`sandboxRunDriver`), and the run record (`InMemoryRunStore`). The event log is
 * in-process, exactly as the recommended `memoryStream` backend is.
 *
 * A provider that cannot satisfy the contract MUST declare `unsupported.reason`.
 * As in the journal suite there is deliberately no silent-skip path: a
 * conformance case that quietly returns prints as a pass, which is how an
 * unimplemented capability ships green.
 *
 * FOUND BY THIS SUITE, FIXED IN THE PROVIDER, STILL NOT ASSERTED HERE. On
 * local-process under Windows (git-bash `sh`), the follow read's `tail`
 * grandchild used to SURVIVE `proc.kill()`: `LocalProcessHandle.killTree` ran
 * `taskkill /PID <sh> /T /F` and returned as soon as `spawnSync` reported no
 * `error`. Two things were wrong. It never checked taskkill's exit status — and
 * that alone would not have caught it, because MSYS's fork emulation leaves the
 * `tail.exe` pointing at an intermediate shell that has already exited, so
 * `taskkill /T` (live parent links only) cannot reach it and still exits `0`.
 * Measured by counting `tail.exe` before and after a run: this suite leaked 4 per
 * run and the shipped journal suite 2, accumulating for the life of the machine.
 * It was a provider defect, not a takeover defect — every case here still
 * delivered the right transcript, because `untilAborted` (see
 * `journal-reader.ts`) stops honoring the pipe once the signal fires rather than
 * waiting for the kill, which is exactly why it never failed a test.
 * `killTree` now resolves the tree through MSYS's own process table and verifies
 * the survivors are gone (0 per run), covered in
 * `ai-sandbox-local-process/tests/kill-tree.test.ts`.
 * Deliberately still NOT asserted in this suite: a per-provider process census is
 * not portable (Docker's `tail` dies with its container), and a conformance case
 * that counted host processes would fail for reasons unrelated to takeover.
 *
 * EVERY WAIT IN THIS FILE IS BOUNDED. A hang stalls CI instead of failing it, so
 * each journal read carries a timeout signal, each poll loop carries a deadline
 * and a message naming what never happened, and each case carries an explicit
 * per-test timeout.
 *
 * Vitest is an OPTIONAL peer dependency: this module is imported only from test
 * files, which already run under Vitest.
 */
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
  /**
   * Declare that this provider cannot support takeover, with the reason.
   * Registers a skipped case whose title carries the reason — a NAMED skip,
   * visible in the reporter. Omit it and the suite runs.
   */
  unsupported?: { reason: string }
}

/**
 * Journal directory for this suite, deliberately NOT
 * {@link DEFAULT_JOURNAL_DIR}: on local-process the sandbox shell shares the
 * host's real `/tmp`, so conformance runs must not write where an application's
 * runs live.
 */
const CONFORMANCE_JOURNAL_DIR = '/tmp/tanstack-takeover-conformance'

/** Poll interval handed to providers that cannot follow a growing file. */
const POLL_INTERVAL_MS = 50

/**
 * Quiescence window for the successor's first append. Short because the
 * predecessor in these cases has provably stopped (the suite sequenced it) —
 * the gate still runs, it just does not need to wait 5s to observe nothing.
 */
const FENCE_QUIET_MS = 25

/**
 * Bound on a real journal read, so a reader that delivers nothing FAILS instead
 * of parking CI.
 *
 * Never an assertion, and deliberately far above anything a healthy read needs
 * (measured: 10–18s for the follow cases on both providers). Every use site
 * pairs it with a `backstopped: false` witness, so a read the CLOCK ended fails
 * naming this backstop rather than as a downstream transcript mismatch — which
 * means this number can be raised freely and must never be the thing a case is
 * tuned against.
 */
const READ_BACKSTOP_MS = 90_000

/**
 * Unique per case, and it must be: `journalPaths` derives the file name from the
 * `runId` and the journal is append-only, so a reused id appends BEHIND the
 * previous run's `{"__exit":N}` sentinel and the new run appears to emit nothing
 * at all (see `journal.ts`). The counter covers two cases created inside the
 * same millisecond; the random suffix covers two suites sharing one `/tmp`.
 */
let caseCounter = 0
function uniqueRunId(label: string): string {
  caseCounter += 1
  const suffix = Math.random().toString(36).slice(2, 8)
  return `tko-${label}-${Date.now()}-${caseCounter}-${suffix}`
}

/**
 * An in-process event log with real accumulated state, plus the two facts the
 * assertions need: what is stored (in append order) and how many times `close()`
 * ran.
 *
 * `snapshot()` returns fresh objects, per the `StreamDurability` contract, so a
 * caller cannot reach the stored log through the result.
 */
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
      // Nothing in this suite tails the log — every assertion reads the stored
      // transcript with `snapshot()`, which is also what `alignToStoredLog`
      // uses, and a `read` would park until `close()` (see `align.ts`).
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

/**
 * A lock that grants every request immediately and never reports a loss.
 *
 * `InMemoryLockStore` SERIALIZES claims within one process, so a second attach
 * waits for the first to finish and the two drivers are never concurrent — which
 * means the epoch fence can never be observed there. `claim.ts` says exactly
 * that: in one process only layer 2, the `driverEpoch` fence, is provable. This
 * models a lease-less lock so the two drives overlap and layer 2 does the work.
 */
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

/**
 * Narrow one parsed journal line into its chunk.
 *
 * Fields are validated and the chunk is REBUILT from them rather than asserted
 * into shape: a cast would let a provider that mangles the bytes (a folded
 * stderr diagnostic, a truncated line) reach `chunkFingerprint` as a
 * structurally invalid chunk and fail somewhere unrelated.
 */
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

/**
 * The translator. Deterministic by construction, which is what makes alignment
 * possible at all: the message id comes from {@link createRunScopedIdGen}, so
 * re-translating the same journal from byte 0 reproduces byte-identical chunks
 * (modulo `timestamp`, the one field `chunkFingerprint` excludes).
 */
async function* translate(
  runId: string,
  lines: AsyncIterable<unknown>,
): AsyncIterable<StreamChunk> {
  const messageId = createRunScopedIdGen(runId)()
  for await (const line of lines) yield toChunk(runId, messageId, line)
}

/**
 * A comparable transcript: each chunk reduced to its {@link chunkFingerprint}.
 *
 * The fingerprint, not the chunk object, and for the same reason alignment uses
 * it — `timestamp` is wall-clock and unreproducible, so a raw `toEqual` on
 * chunks would fail on the one field the feature deliberately ignores. Every
 * other field participates, so a duplicated prefix, a dropped chunk, or a
 * reordered one still fails.
 */
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

/**
 * A real agent: a shell command that prints one NDJSON line per delta, with an
 * optional real pause partway through, then exits.
 *
 * `printf '%s\n' a b c` reuses the format for every operand on GNU coreutils and
 * on busybox alike, so this needs no loop. The JSON contains only double quotes,
 * so it is safe inside the POSIX single-quoted words this builds.
 */
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

/**
 * The reader's journal options for a resolved durability.
 *
 * `journalOptionsFor` answers `undefined` for a NON-durable run, which cannot
 * happen here — every run in this suite is fully wired. Narrowing it with a
 * thrown error rather than a non-null assertion keeps the impossible case loud
 * if the resolver's contract ever changes.
 */
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

/**
 * Wrap a handle so the `process.exec` calls ONE operation makes can be counted.
 *
 * This is how the attach preflight's fail-fast cases are anchored, and the reason
 * they are not anchored on elapsed time. `awaitAttachableJournal` runs exactly one
 * `test -f` before it consults the run store, so a decision made from the record
 * costs one `exec` and a decision made by waiting costs one per
 * `probeIntervalMs`. The count separates those two behaviors exactly; elapsed time
 * does not, because a single `exec` is a provider round-trip whose latency the
 * suite does not control — a `docker exec` on a loaded daemon has been measured at
 * 9.6s, which fails a `< 4_000ms` bound while the preflight under test did
 * precisely the right thing. A timing bound that goes red on a busy machine
 * teaches people to ignore the suite.
 *
 * The spread copies the handle's own methods, so everything except `exec` is the
 * provider's; the wrapper delegates rather than reimplementing.
 */
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

/**
 * Build the driver a host would build for one run.
 *
 * `drive` is the real journal path: read the run's journal from byte 0 (through
 * the attach preflight when attaching), translate, and align against the stored
 * log — `alignedIfAttaching`, so alignment runs on an attach and only on an
 * attach.
 *
 * Returns the driver alongside `backstopped()`, the causal witness for
 * {@link READ_BACKSTOP_MS}: every case that drives this must assert it is
 * `false` before its transcript assertions, so a read the CLOCK ended fails
 * naming the backstop instead of as a truncated-transcript diff.
 */
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
      // The read is bounded independently of `signal`: an `InMemoryLockStore`
      // hands out a signal it never aborts, so a journal that stops growing
      // would otherwise park this read forever and turn a broken takeover into a
      // hung CI job instead of a failing assertion.
      //
      // Not the assertion — see {@link READ_BACKSTOP_MS}. `backstopped()` below
      // is what proves the clock was not what ended the read.
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
  } catch {
    // The sandbox may already be gone. Nothing under test depends on the files
    // being absent afterwards — the cases that DO assert deletion assert it
    // directly.
  }
}

/**
 * Assert `createHandle` satisfies the takeover conformance contract. Each `it`
 * gets a fresh sandbox via `createHandle`/`dispose`, and a unique `runId`, so no
 * case can observe another's journal.
 */
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

    // ---------------------------------------------------------------------
    // 1. A real takeover, end to end.
    // ---------------------------------------------------------------------
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

          // THE HOST THAT DIES. A real claim, a real fence, a real journal read
          // of a real agent — and then it stops after `prefixLength` chunks
          // without closing the log and without terminalizing the record, which
          // is what a host vanishing looks like from the outside.
          const deliveredByFirst: Array<StreamChunk> = []
          // A backstop, so a reader that delivers nothing fails instead of
          // parking CI. Not the assertion — `backstopped` below proves it was not
          // what ended the loop.
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
              for await (const chunk of translate(runId, lines)) {
                await fenced.append([chunk])
                deliveredByFirst.push(chunk)
                // Breaking ends the reader's `tail` before this host walks away;
                // the AGENT keeps running, which is the whole premise.
                if (deliveredByFirst.length === prefixLength) break
              }
            },
          )
          // The causal witness for the dying host's read: it must stop because
          // the consumer broke at `prefixLength`, not because the clock ran out.
          // A backstopped read here delivers a short prefix and the takeover the
          // case exists to exercise would start from the wrong offset.
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

          // THE CAUSAL WITNESS, first — see {@link READ_BACKSTOP_MS}. The
          // transcript assertions below can only speak about chunks that
          // arrived; this one says the successor's read ended because the
          // journal ended, not because the clock did. Without it a backstopped
          // read reports as a confusing short-transcript diff.
          expect({ backstopped: successor.backstopped() }).toEqual({
            backstopped: false,
          })

          // THE TRANSCRIPT, element for element. This is the assertion that can
          // see the failure the feature exists to prevent: a takeover that
          // replays the journal from byte 0 without aligning re-appends the
          // prefix, so `stored` would be 9 entries beginning `1,2,3,1,2,3,…` —
          // and the user would watch the first half of the run twice. "Chunks
          // arrived" passes against that; this does not.
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

    // ---------------------------------------------------------------------
    // 2. The attach preflight, against a real filesystem.
    // ---------------------------------------------------------------------
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
          // Decided from the RECORD, not by waiting it out: one `test -f`, then
          // the store. A preflight that polled to the deadline would run ~80
          // probes here. See `countingExec` for why this is not a stopwatch.
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
          // A real driver writing its real first line ~400ms after the attach
          // starts probing. This is the NORMAL case — `journalFollowCommand`'s
          // `: >> file` exists for it — so failing fast here would reintroduce
          // the defect that fix cured.
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
          // The three assertions above ARE the proof the bound was applied: an
          // unbounded wait never produces a `JournalAttachUnavailableError` at
          // all, and `'600ms'` in the message is the configured bound reported
          // back. No stopwatch assertion here on purpose — the case's own
          // `{ timeout: 120_000 }` already converts an unbounded wait into a
          // failure, and a wall-clock ceiling would red a CORRECT implementation
          // on a machine where one `docker exec` was measured at 95s.
          expect(error.message).toContain('600ms')
        } finally {
          await dispose()
        }
      },
    )

    // ---------------------------------------------------------------------
    // 3. The epoch fence and the shared latch, under real concurrency.
    // ---------------------------------------------------------------------
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

          // The LOSER: the original host, so it does not align (there is nothing
          // stored when it starts). Gated before its first chunk reaches the
          // log, which is where the fence has to catch it — after the successor
          // has claimed and finished. The gate sits INSIDE the source stream, so
          // the loser's alignment snapshot (were it attaching) and its first
          // append both happen after the release, exactly as a host paused by a
          // GC or a VM suspend would.
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
          // The causal witness, before the transcript — see
          // {@link READ_BACKSTOP_MS}. The winner drives the run to its sentinel,
          // so a clock-ended read here must say so rather than surface as a
          // missing chunk.
          expect({ backstopped: winner.backstopped() }).toEqual({
            backstopped: false,
          })
          expect(transcript(log.stored())).toEqual(transcript(expected))

          // Now let the superseded host try to write.
          released.open()
          await loser
          // The causal witness, and here it is load-bearing rather than merely
          // diagnostic: the loser's gate is awaited from INSIDE its read, so a
          // backstopped read would abandon the stream during the wait, the loser
          // would never attempt an append at all, and every "nothing lands"
          // assertion below would pass vacuously without the fence ever running.
          expect({ backstopped: losingDriver.backstopped() }).toEqual({
            backstopped: false,
          })

          // NOTHING lands — not the run's chunks a second time, and not
          // `pipeToRunLog`'s recovery `RUN_ERROR` either. That log belongs to the
          // WINNER: a terminal `RUN_ERROR` from a dead host would fail the stream
          // for every client attached to the live, healthy run.
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
          // `close()` is deliberately OUTSIDE both fences: it runs on the very
          // teardown caused by losing the claim, and a fenced close would wedge
          // the record at `'running'` with every live tailer parked forever. Two
          // drivers, two closes.
          expect(log.closes()).toBe(2)
        } finally {
          await cleanup(handle, runId)
          await dispose()
        }
      },
    )

    // ---------------------------------------------------------------------
    // 4. Journal cleanup on a terminal run, and the attach that follows it.
    // ---------------------------------------------------------------------
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
          // A backstop, so a reader that delivers nothing fails instead of
          // parking CI. Not the assertion — `backstopped` below proves it was not
          // what ended the loop.
          const backstop = AbortSignal.timeout(READ_BACKSTOP_MS)
          for await (const chunk of translate(
            runId,
            readJournalNdjson(handle, {
              signal: backstop,
              journal: journalOptions(fresh, runId),
            }),
          )) {
            seen.push(chunk)
          }
          // The causal witness, first: this loop has no `break`, so the ONLY
          // honest reasons for it to end are the sentinel or the backstop. A
          // clock-ended read must say so rather than report a short transcript.
          expect({ backstopped: backstop.aborted }).toEqual({
            backstopped: false,
          })
          // Reaching the sentinel is what makes the run terminal, and it is the
          // precondition for the deletion below.
          expect(transcript(seen)).toEqual(
            transcript(expectedTranscript(runId, deltas)),
          )

          // Real files, really gone — asserted through the shell, never
          // `handle.fs.exists`: on local-process the two resolve `/tmp`
          // differently, so an `fs` probe would answer about a path the journal
          // was never written to (`journal.ts` rule 3).
          // Named rather than two bare `.not.toBe(0)` assertions on an exit
          // code, so a regression reports WHICH file survived instead of
          // `expected +0 not to be +0`.
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

          // The run is over, so the record says so — and the attach that follows
          // must answer from the record rather than tail the journal, which
          // `journalFollowCommand` would obligingly re-create as an empty file
          // that no sentinel can ever arrive in.
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
          // The journal really is gone (asserted above), so the preflight takes
          // the record arm: one `test -f`, then the store, no wait. This is the
          // bound that failed as `expected 9652 to be less than 4000` under
          // parallel Docker load, where the 9.6s was one `docker exec`
          // round-trip and not the preflight — see `countingExec`.
          expect(probes.execs()).toBe(1)
        } finally {
          await cleanup(handle, runId)
          await dispose()
        }
      },
    )
  })
}
