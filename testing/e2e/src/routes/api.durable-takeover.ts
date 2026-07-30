import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  RUN_CANCEL_REASON,
  chat,
  memoryStream,
  requestRunCancel,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { InMemoryLockStore, withLocks } from '@tanstack/ai/locks'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'
import {
  InMemorySandboxInstanceStore,
  alignedIfAttaching,
  createRunScopedIdGen,
  defineSandbox,
  defineWorkspace,
  exitSentinelLine,
  getSandboxDurability,
  journalPaths,
  probeRunExit,
  pruneJournals,
  reapDetachedRuns,
  resolveDurableRunId,
  sandboxReclaimer,
  sandboxRunDriver,
  withSandbox,
} from '@tanstack/ai-sandbox'
import type {
  AnyTextAdapter,
  ModelMessage,
  RunRecord,
  StreamChunk,
} from '@tanstack/ai'
import type { LockStore } from '@tanstack/ai/locks'
import type {
  PruneJournalsResult,
  ReapResult,
  RunExitProbe,
  SandboxHandle,
  SandboxProvider,
  SandboxRunDurability,
} from '@tanstack/ai-sandbox'

/**
 * Durable, detachable sandboxed runs over real HTTP: detach on disconnect,
 * takeover, out-of-band cancel vs. plain disconnect, and the single-writer
 * epoch fence.
 *
 * WHAT IS REAL AND WHAT IS A STAND-IN. Everything that decides the behaviors
 * under test is production code — `withSandbox`'s durability resolution and its
 * detach-vs-destroy `onAbort` branch, `withPersistence`'s
 * `DetachableRunCapability` branch, `requestRunCancel` / `wasCancelRequested` /
 * `RUN_CANCEL_REASON`, `resolveDurableRunId`, `alignedIfAttaching`
 * (`alignToStoredLog`), `sandboxRunDriver`'s claim and BOTH its fences, core's
 * `startRunDriver`, and — for the sweep — `reapDetachedRuns`, `probeRunExit`,
 * `pruneJournals` and `sandboxReclaimer`. Two things are stand-ins:
 *
 * - **The sandbox provider** is a fake handle (no container). It records every
 *   `destroy` per sandbox key, which is how "an explicit cancel tears the
 *   sandbox down" is asserted.
 * - **The agent's journal** is a counter instead of an NDJSON file inside the
 *   sandbox. The substitution keeps the property the journal exists for: the
 *   agent's output lives OUTSIDE the request, so it survives the client
 *   disconnect and a later attach re-reads it from the first line. The counter
 *   advances only on an explicit `?action=tick`, so a test controls exactly
 *   where mid-stream it disconnects — no timers, no sleeps, no flake. The
 *   counter is ALSO projected as a real NDJSON file in a fake journal directory
 *   (see `journalDirs`), because `probeRunExit` and `pruneJournals` read that
 *   directory through `handle.process.exec` and parse its stdout — so those two
 *   run for real rather than being stubbed.
 *
 * Provider-free (no LLM in the loop), so this route is exempt from the aimock
 * policy, like the other durability harness routes.
 *
 * Actions, all keyed by a caller-supplied `runId` that must be unique per test:
 *
 * - `POST ?runId&threadId&total` — start a fresh durable run over SSE.
 * - `POST ?action=tick&runId&n` — advance the agent's journal by `n` lines.
 * - `POST ?action=drop&runId` — the client disconnect (see `dropResponse`).
 * - `POST ?action=seed&runId&threadId&total&lines&detachedSince` — construct the
 *   takeover PRECONDITION directly: a running record, a detached marker, a live
 *   agent, and an OPEN log holding the prefix a previous host delivered. See
 *   "Why seeding exists" below.
 * - `GET  ?runId&offset=-1` — attach: replay the log AND take the run over.
 * - `POST ?action=cancel&runId&band=both|durable|inprocess` — out-of-band cancel.
 * - `POST ?action=reap&runId…&now&runBudgetMs` — one reaper sweep, scoped to the
 *   runIds named (repeat `runId`), plus one journal-directory sweep per sandbox
 *   those runs live in. See {@link reapResponse}.
 * - `GET  ?action=state&runId` — the observable server state, as JSON.
 *
 * Any request may add `?nondeterministic=1` alongside its `runId` to make that
 * run's translator mint a message id that is NOT run-scoped — see
 * {@link nondeterministicRuns}.
 *
 * WHY SEEDING EXISTS. A takeover's documented precondition is "record still
 * `running`, delivery log OPEN and holding what was already delivered, agent
 * still working". `?action=seed` writes exactly that, with the same translator a
 * live host would have used, so the takeover machinery can be exercised in
 * isolation from whatever produced the prefix — no disconnect timing, no
 * dependence on the producing host at all.
 *
 * A real `?action=drop` now produces the same precondition (core's delivery sink
 * leaves a DETACHED run's log open — see `RunDetachedCapability`), and the spec
 * pins the disconnect→takeover path end to end as well. Seeding is kept because
 * the two prove different things: seeding proves a takeover can pick up a prefix
 * it did not produce, which is the cross-host case a single-process test cannot
 * otherwise reach.
 */

// ---------------------------------------------------------------------------
// The fake agent's journal: output that outlives the request that started it.
// ---------------------------------------------------------------------------

interface FakeJournal {
  /** Lines written so far. Advanced only by `?action=tick`. */
  lines: number
  /** Line count at which the agent finishes and seals the journal. */
  total: number
  done: boolean
  /** Set when this run's sandbox is destroyed — the agent dies with it. */
  killed: boolean
  /** The sandbox this run's agent lives in, so a destroy is attributable. */
  sandboxKey: string
}

const journals = new Map<string, FakeJournal>()

// ---------------------------------------------------------------------------
// The fake sandbox's journal DIRECTORY.
//
// The counter above is what the harness adapter tails. This is the same journal
// as a FILE, because two pieces of production code under test read the journal
// directory through `handle.process.exec` and parse its stdout —
// `probeRunExit` (`tail -c -N … | base64`) and `pruneJournals`
// (`ls -1`, `stat -c '%Y %n'`, `rm -f`). Stubbing either of them out would leave
// the reaper's "did the agent finish?" decision and the sweep's keep/delete
// decision untested, so `exec` answers that shell text instead (see
// `execJournalCommand`). The file's CONTENT is derived from the run's
// `FakeJournal` on demand, so `?action=tick` moves the counter and the file
// together and they can never disagree.
// ---------------------------------------------------------------------------

/** One file in a sandbox's journal directory. */
interface JournalFile {
  /** The run whose `FakeJournal` supplies this file's bytes. */
  runId: string
  mtimeMs: number
}

/** Per sandbox key, the journal filenames that currently exist in it. */
const journalDirs = new Map<string, Map<string, JournalFile>>()

function journalDirFor(sandboxKey: string): Map<string, JournalFile> {
  const existing = journalDirs.get(sandboxKey)
  if (existing !== undefined) return existing
  const created = new Map<string, JournalFile>()
  journalDirs.set(sandboxKey, created)
  return created
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * Register a run's journal and its `.err` sidecar under its sandbox, with the
 * names `journalPaths` derives — the SAME function `pruneJournals` uses to build
 * the `rm`, so a name this harness invents can never diverge from one the sweep
 * targets.
 */
function createJournalFiles(runId: string, sandboxKey: string): void {
  const paths = journalPaths(runId)
  const dir = journalDirFor(sandboxKey)
  const mtimeMs = Date.now()
  dir.set(baseName(paths.journal), { runId, mtimeMs })
  dir.set(baseName(paths.stderr), { runId, mtimeMs })
}

/** Whether a run's journal file still exists — i.e. a sweep has not deleted it. */
function journalFileExists(runId: string, sandboxKey: string): boolean {
  return journalDirFor(sandboxKey).has(baseName(journalPaths(runId).journal))
}

/**
 * The run's journal as NDJSON, exactly as `journaledCommand` would have written
 * it: one line per journal line, then the real `{"__exit":N,"__nonce":"…"}`
 * sentinel once the agent is done — built with {@link exitSentinelLine}, the
 * SAME helper `journaledCommand`'s `printf` and the reader are asserted against
 * byte-for-byte, so this harness cannot drift onto a shape `parseJournalExit`
 * refuses. `parseJournalExit` reads the sentinel and nothing else, so the line
 * payloads only have to be valid JSON that does not carry the sentinel key.
 */
function journalContent(runId: string): string {
  const journal = journals.get(runId)
  if (journal === undefined) return ''
  let text = ''
  for (let line = 1; line <= journal.lines; line += 1) {
    text += `{"line":${line}}\n`
  }
  if (journal.done) text += `${exitSentinelLine(journalPaths(runId), 0)}\n`
  return text
}

/** Every single-quoted word in a command, as `journal.ts` quotes its paths. */
function quotedWords(command: string): Array<string> {
  return [...command.matchAll(/'([^']*)'/g)].map((match) => match[1] ?? '')
}

/**
 * Answer the four journal-directory commands `journal.ts` composes, for ONE
 * sandbox's directory. Anything else answers empty, as the rest of this fake
 * handle does.
 *
 * The `tail` arm's missing-file answer is load bearing: the real command ends
 * `2>/dev/null | base64`, so a journal that is not there contributes no bytes and
 * the pipe emits the base64 of nothing — which `parseJournalExit` reads as "no
 * sentinel", i.e. `'producing'`. Answering an error string instead would let a
 * pruned journal read as a finished agent.
 */
function execJournalCommand(
  sandboxKey: string,
  command: string,
): { stdout: string; stderr: string; exitCode: number } {
  const dir = journalDirFor(sandboxKey)
  const words = quotedWords(command)
  const ok = (stdout: string) => ({ stdout, stderr: '', exitCode: 0 })

  if (command.startsWith('ls -1 ')) return ok([...dir.keys()].join('\n'))

  if (command.startsWith(`stat -c '%Y %n' `)) {
    // `words[0]` is the quoted FORMAT (`%Y %n`); the directory is the next word.
    const root = words[1] ?? ''
    // The directory itself FIRST: `parseJournalMtimeListing` treats that line as
    // its self-witness and answers `unavailable` without it.
    const lines = [`${Math.floor(Date.now() / 1000)} ${root}`]
    for (const [name, file] of dir) {
      lines.push(`${Math.floor(file.mtimeMs / 1000)} ${root}/${name}`)
    }
    return ok(lines.join('\n'))
  }

  if (command.startsWith('rm -f ')) {
    for (const word of words) dir.delete(baseName(word))
    return ok('')
  }

  if (command.startsWith('tail -c -')) {
    const file = dir.get(baseName(words[0] ?? ''))
    return ok(file === undefined ? '' : btoa(journalContent(file.runId)))
  }

  return ok('')
}

/** Sandbox keys passed to `provider.destroy`, in order. */
const destroyedSandboxes: Array<string> = []

/** Runs this process is currently driving (the in-process cancel band). */
const driving = new Map<string, AbortController>()

/**
 * Per-run bookkeeping for ATTACHING drives: how many reached the adapter, how
 * many chunks they produced, and how many have finished producing.
 *
 * Exposed on `?action=state` because the fencing test needs both halves. Without
 * `attachDrives`, "the log has no duplicates" is also satisfied by a second
 * driver that never ran. Without `attachDriveEnds`, the test can assert before
 * the LOSER has had its chance to write, which passes even with the fence
 * removed — verified, so this is load bearing, not decoration.
 */
const attachDrives = new Map<string, number>()
const attachChunks = new Map<string, number>()
const attachDriveEnds = new Map<string, number>()

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

const persistence = memoryPersistence()
const { runs } = persistence.stores

/**
 * Explicit instance map, so `sandboxReclaimer` can resolve the provider sandbox
 * behind a terminal run. `withSandbox` falls back to a private in-memory store
 * when this is omitted, and `reclaimSandbox` cannot see that one — a reaper wired
 * without it reports `'no-sandbox-key'`/`'not-found'` forever and every sandbox
 * leaks. Same store on every `withSandbox` call here, so the key one branch wrote
 * is the key another reads.
 */
const instances = new InMemorySandboxInstanceStore()

/**
 * The detached-run TTL. `reapDetachedRuns` is its ONE consumer: the reaper's
 * inclusive `detachedSince <= now - ttl` cutoff is the only thing that decides
 * expiry, so this single value is what the boundary cases in the spec are
 * constructed against.
 *
 * There is deliberately no second, duration-string spelling passed to
 * `withSandbox`. `withSandbox`'s durability options carry no TTL — a
 * `detachedRunTtl` there was parsed and read by nothing, so it could silently
 * disagree with the value below while looking authoritative.
 */
const DETACHED_RUN_TTL_MS = 5 * 60 * 1000

/** The ordinary wiring: one lock store, serializing claims in this process. */
const serializingLocks = new InMemoryLockStore()

/**
 * A lock that grants every request immediately and never reports a loss.
 *
 * `InMemoryLockStore` SERIALIZES claims inside one process, so a second attach
 * waits for the first to finish and the two drivers are never concurrent —
 * which means the fence can never be observed there.
 * `packages/ai-sandbox/src/claim.ts` says exactly that: within one process only
 * layer 2, the `driverEpoch` fence, is provable. This models a lease-less lock
 * so the two drives overlap and layer 2 does the work.
 */
const permissiveLocks: LockStore = {
  withLock: (_key, fn) => fn(new AbortController().signal),
}

function locksFor(url: URL): LockStore {
  return url.searchParams.get('locks') === 'permissive'
    ? permissiveLocks
    : serializingLocks
}

function startAgent(
  runId: string,
  threadId: string,
  total: number,
): FakeJournal {
  const existing = journals.get(runId)
  if (existing) return existing
  const journal: FakeJournal = {
    lines: 0,
    total,
    done: false,
    killed: false,
    sandboxKey: sandbox.key({ threadId, runId }),
  }
  journals.set(runId, journal)
  // The reader creates the journal file before it writes a line — see
  // `journalFollowCommand`'s `: >> file` — so the file exists from run start.
  createJournalFiles(runId, journal.sandboxKey)
  return journal
}

function tickAgent(runId: string, n: number): FakeJournal | undefined {
  const journal = journals.get(runId)
  if (!journal || journal.killed) return journal
  journal.lines = Math.min(journal.total, journal.lines + n)
  if (journal.lines >= journal.total) journal.done = true
  return journal
}

const JOURNAL_STALL_MS = 20_000
const JOURNAL_POLL_MS = 20

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Follow the journal, yielding each line index as it appears.
 *
 * Bounded on purpose: a tail that parks forever turns a broken attach into a
 * hung CI job instead of a failing test. Ends WITHOUT a terminal when the
 * consumer's signal aborts, so a disconnect never synthesizes a completion.
 */
async function* tailJournal(
  runId: string,
  signal: AbortSignal | undefined,
): AsyncIterable<number> {
  const journal = journals.get(runId)
  if (!journal) {
    throw new Error(`durable-takeover: no journal for run ${runId}`)
  }
  let delivered = 0
  let waited = 0
  for (;;) {
    while (delivered < journal.lines) {
      delivered += 1
      yield delivered
    }
    if (journal.done || journal.killed) return
    if (signal?.aborted) return
    await sleep(JOURNAL_POLL_MS)
    waited += JOURNAL_POLL_MS
    if (waited > JOURNAL_STALL_MS) {
      throw new Error(
        `durable-takeover: journal for run ${runId} stalled at ${delivered}/${journal.total} lines`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// The translator. Deterministic by construction, which is what makes alignment
// possible: ids come from `createRunScopedIdGen`, never a clock or randomness,
// so re-translating the same journal from line 1 reproduces byte-identical
// chunks. `timestamp` is the one wall-clock field, and `chunkFingerprint`
// excludes exactly that.
//
// The individual builders are shared with `?action=seed`, so a seeded prefix and
// a live replay cannot drift apart in shape.
// ---------------------------------------------------------------------------

/**
 * Runs whose translator must mint a message id that is NOT run-scoped.
 *
 * The determinism above is a PRECONDITION of the takeover, not a property of it:
 * `alignToStoredLog` compares the replay's chunks to the stored ones by
 * fingerprint and throws `JournalReplayDivergedError` on the first mismatch. That
 * guard is the only thing standing between a translator that quietly stopped
 * being deterministic and a delivered stream whose prefix and suffix disagree
 * about message identity, so it needs a way to be provoked at the HTTP boundary
 * rather than only in a unit test. `?nondeterministic=1` is that way: the stored
 * prefix keeps the run-scoped id (`deliveredPrefix` is unchanged, exactly as a
 * previous host wrote it) while the replay mints a fresh one, so alignment
 * diverges at the `TEXT_MESSAGE_START` and the error must surface on the attach's
 * socket instead of being swallowed.
 */
const nondeterministicRuns = new Set<string>()

/** The translated message id: run-scoped, unless this run opted out. */
function messageIdFor(runId: string): string {
  if (nondeterministicRuns.has(runId)) return `nd-${crypto.randomUUID()}`
  return createRunScopedIdGen(runId)()
}

function runStartedChunk(runId: string, threadId: string): StreamChunk {
  return { type: EventType.RUN_STARTED, runId, threadId, timestamp: Date.now() }
}

function messageStartChunk(messageId: string): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: 'assistant',
    timestamp: Date.now(),
  }
}

/** Every delta up to and including `line`, concatenated. */
function accumulatedContent(line: number): string {
  let text = ''
  for (let n = 1; n <= line; n += 1) text += String(n)
  return text
}

function contentChunk(messageId: string, line: number): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: String(line),
    // `content` is the text accumulated SO FAR, as the real adapters emit it —
    // not a second copy of the delta. It matters because that field is what the
    // message a run saves is assembled from, so emitting the delta here made
    // every saved transcript one chunk long. Derived from `line` alone, so a
    // replay reproduces it byte for byte and alignment still holds.
    content: accumulatedContent(line),
    timestamp: Date.now(),
  }
}

function messageEndChunk(messageId: string): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_END,
    messageId,
    timestamp: Date.now(),
  }
}

function runFinishedChunk(runId: string, threadId: string): StreamChunk {
  return {
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    finishReason: 'stop',
    timestamp: Date.now(),
  }
}

async function* translate(
  runId: string,
  threadId: string,
  lines: AsyncIterable<number>,
): AsyncIterable<StreamChunk> {
  const messageId = messageIdFor(runId)
  yield runStartedChunk(runId, threadId)
  yield messageStartChunk(messageId)
  for await (const line of lines) yield contentChunk(messageId, line)
  yield messageEndChunk(messageId)
  yield runFinishedChunk(runId, threadId)
}

/** The chunks a previous host would have delivered for `lines` journal lines. */
function deliveredPrefix(
  runId: string,
  threadId: string,
  lines: number,
): Array<StreamChunk> {
  const genId = createRunScopedIdGen(runId)
  const messageId = genId()
  const chunks: Array<StreamChunk> = [
    runStartedChunk(runId, threadId),
    messageStartChunk(messageId),
  ]
  for (let line = 1; line <= lines; line += 1) {
    chunks.push(contentChunk(messageId, line))
  }
  return chunks
}

/** The subset of a text adapter's stream options this harness reads. */
interface HarnessStreamOptions {
  runId?: string
  threadId?: string
  capabilities?: Parameters<typeof getSandboxDurability>[0]
  abortController?: AbortController
  /**
   * How `chat()` actually hands an adapter the run's abort signal: it builds
   * `{ signal }` from the caller's `abortController` and passes it as `request`,
   * never the controller itself. The real harness adapters read both, in this
   * order, and so must this one — reading only `abortController` leaves the
   * journal tail blind to the abort and the run deadlocks.
   */
  request?: Request | RequestInit
}

function abortSignalFor(
  options: HarnessStreamOptions,
): AbortSignal | undefined {
  return options.abortController?.signal ?? options.request?.signal ?? undefined
}

/**
 * A journaling harness adapter, wired the way the real ones are: read the
 * resolved durability off the capability bus, resolve the durable `runId` with
 * `resolveDurableRunId`, and wrap the FINAL translated sequence in
 * `alignedIfAttaching` so alignment runs on an attach and only on an attach.
 */
const harnessAdapter: AnyTextAdapter = {
  kind: 'text',
  name: 'fake-harness',
  model: 'fake-harness-model',
  '~types': {},
  chatStream: (options: HarnessStreamOptions): AsyncIterable<StreamChunk> => {
    const durability: SandboxRunDurability | undefined = options.capabilities
      ? getSandboxDurability(options.capabilities, { optional: true })
      : undefined
    const runId = resolveDurableRunId(options.runId, {
      durable: durability !== undefined,
      adapter: 'fake-harness',
      fallback: () => crypto.randomUUID(),
    })
    const threadId = options.threadId ?? runId
    // An attach must never start a second agent: it tails the journal the first
    // one is still writing. Only a fresh run spawns.
    if (durability?.attach !== true) startAgent(runId, threadId, 6)
    else bump(attachDrives, runId)
    const counted = durability?.attach === true
    return alignedIfAttaching(
      (async function* () {
        try {
          for await (const chunk of translate(
            runId,
            threadId,
            tailJournal(runId, abortSignalFor(options)),
          )) {
            if (counted) bump(attachChunks, runId)
            yield chunk
          }
        } finally {
          if (counted) bump(attachDriveEnds, runId)
        }
      })(),
      durability,
    )
  },
  structuredOutput: () => Promise.resolve({ data: {}, rawText: '{}' }),
} as unknown as AnyTextAdapter

// ---------------------------------------------------------------------------
// Fake sandbox provider. Records destroys per key; a destroy kills that
// sandbox's agent, because closing an agent's IO stream does NOT stop it — the
// reason a cancel destroys the sandbox at all.
// ---------------------------------------------------------------------------

function fakeHandle(id: string): SandboxHandle {
  return {
    id,
    provider: 'fake',
    capabilities: {
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
    },
    fs: {
      read: () => Promise.resolve(''),
      readBytes: () => Promise.resolve(new Uint8Array()),
      write: () => Promise.resolve(),
      list: () => Promise.resolve([]),
      mkdir: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      exists: () => Promise.resolve(false),
    },
    git: {
      clone: () => Promise.resolve(),
      status: () => Promise.resolve(''),
      add: () => Promise.resolve(),
      commit: () => Promise.resolve(),
      push: () => Promise.resolve(),
      pull: () => Promise.resolve(),
      branch: () => Promise.resolve('main'),
    },
    process: {
      // `id` IS the sandbox key (`ensure` passes `create({ id: key })`), so this
      // handle reads and writes exactly its own sandbox's journal directory.
      exec: (command: string) =>
        Promise.resolve(execJournalCommand(id, command)),
      spawn: () => Promise.reject(new Error('not supported')),
    },
    ports: { connect: () => Promise.reject(new Error('not supported')) },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }
}

const provider: SandboxProvider = {
  name: 'fake',
  capabilities: () => fakeHandle('probe').capabilities,
  create: (input) => Promise.resolve(fakeHandle(input.id ?? 'fake-sandbox')),
  resume: (input) => Promise.resolve(fakeHandle(input.id)),
  destroy: (input) => {
    destroyedSandboxes.push(input.id)
    // Scoped to this sandbox's own runs: the suite runs fully parallel, so
    // killing every live journal would poison other tests.
    for (const journal of journals.values()) {
      if (journal.sandboxKey === input.id) journal.killed = true
    }
    return Promise.resolve()
  },
}

const sandbox = defineSandbox({
  id: 'durable-takeover',
  provider,
  workspace: defineWorkspace({ source: { type: 'none' } }),
  fileEvents: false,
})

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function requiredParam(url: URL, key: string): string {
  const value = url.searchParams.get(key)
  if (value === null || value.length === 0) {
    throw new Error(`durable-takeover: ${key} is required`)
  }
  return value
}

function intParam(url: URL, key: string, fallback: number): number {
  const raw = url.searchParams.get(key)
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** A `memoryStream` bound to one run, independent of the current request. */
function logFor(runId: string) {
  return memoryStream(
    new Request(
      `http://durable-takeover.local/?runId=${encodeURIComponent(runId)}`,
      { method: 'POST' },
    ),
  )
}

/** Mirror the driver's abort signal onto a controller `chat()` can take. */
function controllerFor(signal: AbortSignal): AbortController {
  const controller = new AbortController()
  const abort = (): void => controller.abort(signal.reason)
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  return controller
}

interface StateBody {
  record: RunRecord | null
  /** Attaching drives that reached the adapter for this run. */
  attachDrives: number
  /** Chunks those drives produced in total (pre-alignment). */
  attachChunks: number
  /** Attaching drives that have finished producing. */
  attachDriveEnds: number
  /** Whether THIS run's sandbox has been destroyed. */
  sandboxDestroyed: boolean
  journal: FakeJournal | null
  /**
   * Whether this run's journal FILE still exists in its sandbox.
   *
   * The reaper's counterpart sweep, `pruneJournals`, decides per run whether the
   * journal may be deleted, and its whole risk is deleting one it must keep — the
   * journal is the only copy of the bytes a successor replays. Without this the
   * sweep's summary is the only witness, and a summary that says `deleted: [x]`
   * cannot show that `y`'s bytes are still there.
   */
  journalFile: boolean
  /**
   * The transcript `withPersistence.onFinish` saved for this run's thread.
   *
   * This is what makes the reaper's `'finalized'` outcome worth anything: a run
   * that reached its sentinel while detached has nobody driving it, so nothing
   * calls `onFinish` and the conversation NEVER lands — the whole point of
   * finalizing it is that the transcript appears here afterwards.
   */
  messages: Array<{ role: string; text: string }>
  /** The run's delivery log, reduced to what the assertions read. */
  log: Array<{ type: string; delta?: string; message?: string }>
}

/** Flatten a stored message to its text, so a spec can assert on it. */
function messageText(message: ModelMessage): string {
  const content: unknown = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part: unknown) => {
      if (typeof part !== 'object' || part === null) return ''
      if (Reflect.get(part, 'type') !== 'text') return ''
      const content: unknown = Reflect.get(part, 'content')
      return typeof content === 'string' ? content : ''
    })
    .join('')
}

async function stateResponse(url: URL): Promise<Response> {
  const runId = requiredParam(url, 'runId')
  const snapshot = await logFor(runId).snapshot()
  const journal = journals.get(runId) ?? null
  const record = await runs.get(runId)
  const threadId = record?.threadId ?? `thread-${runId}`
  const stored = await persistence.stores.messages.loadThread(threadId)
  const body: StateBody = {
    record,
    attachDrives: attachDrives.get(runId) ?? 0,
    attachChunks: attachChunks.get(runId) ?? 0,
    attachDriveEnds: attachDriveEnds.get(runId) ?? 0,
    sandboxDestroyed:
      journal !== null && destroyedSandboxes.includes(journal.sandboxKey),
    journal,
    journalFile:
      journal !== null && journalFileExists(runId, journal.sandboxKey),
    messages: stored.map((message) => ({
      role: message.role,
      text: messageText(message),
    })),
    log: snapshot.map((entry) => {
      const delta: unknown = Reflect.get(entry.chunk, 'delta')
      const message: unknown = Reflect.get(entry.chunk, 'message')
      return {
        type: entry.chunk.type,
        ...(typeof delta === 'string' ? { delta } : {}),
        ...(typeof message === 'string' ? { message } : {}),
      }
    }),
  }
  return Response.json(body)
}

/**
 * Drop the run's connection: abort its `AbortController` with NO reason.
 *
 * This is the disconnect, injected at the seam a real one reaches. It has to be
 * injected because a client `fetch` abort does not propagate to the server
 * through this app's dev server — the request keeps running — so a test cannot
 * produce a server-observable disconnect by closing its own socket.
 *
 * Faithful where it matters: `chat()`'s abort hooks and the delivery sink share
 * this one controller, so aborting it is exactly what the transport does when
 * the socket goes away, and the abort carries no reason — which is the ENTIRE
 * difference from `?action=cancel`'s in-process band, and precisely the
 * "identical connection close, different out-of-band intent" the feature
 * distinguishes.
 */
function dropResponse(url: URL): Response {
  const runId = requiredParam(url, 'runId')
  const controller = driving.get(runId)
  controller?.abort()
  return Response.json({ dropped: controller !== undefined })
}

async function cancelResponse(url: URL): Promise<Response> {
  const runId = requiredParam(url, 'runId')
  const band = url.searchParams.get('band') ?? 'both'
  // Band 1 (durable): the only channel that reaches a run driven elsewhere.
  if (band === 'both' || band === 'durable') {
    await requestRunCancel(runs, runId)
  }
  // Band 2 (in-process): stops a co-located driver immediately.
  if (band === 'both' || band === 'inprocess') {
    driving.get(runId)?.abort(RUN_CANCEL_REASON)
  }
  return new Response(null, { status: 204 })
}

/**
 * Construct a takeover precondition: running record, detached marker, live
 * agent, and an OPEN log holding the prefix a previous host delivered.
 */
async function seedResponse(url: URL): Promise<Response> {
  const runId = requiredParam(url, 'runId')
  const threadId = url.searchParams.get('threadId') ?? `thread-${runId}`
  const total = intParam(url, 'total', 6)
  const lines = intParam(url, 'lines', 2)

  // `detachedSince` is INJECTABLE because it is the field the reaper's TTL
  // boundary is computed from. With `now` injected on `?action=reap` too, both
  // sides of `detachedSince <= now - ttl` are supplied by the test, so a spec can
  // land a run exactly ON the inclusive cutoff and one millisecond inside it with
  // no fake clock anywhere and no dependence on how long the request took.
  const detachedSince = intParam(url, 'detachedSince', Date.now())

  const journal = startAgent(runId, threadId, total)
  tickAgent(runId, lines)
  await runs.createOrResume({ runId, threadId, startedAt: Date.now() })
  await runs.update(runId, {
    detachedSince,
    sandboxKey: journal.sandboxKey,
  })
  // Appended, never closed: the host that would have closed the log is the host
  // that died.
  await logFor(runId).append(deliveredPrefix(runId, threadId, lines))
  return Response.json({ seeded: lines, sandboxKey: journal.sandboxKey })
}

function startResponse(url: URL): Response {
  const runId = requiredParam(url, 'runId')
  const threadId = url.searchParams.get('threadId') ?? `thread-${runId}`
  startAgent(runId, threadId, intParam(url, 'total', 6))

  const log = logFor(runId)
  // ONE controller for the run and its delivery, so a client disconnect reaches
  // `chat()`'s abort hooks. Without it `withSandbox.onAbort` never runs and
  // nothing detaches — see the note in the spec.
  const abortController = new AbortController()
  driving.set(runId, abortController)

  const stream = chat({
    adapter: harnessAdapter,
    messages: [{ role: 'user', content: 'go' }],
    runId,
    threadId,
    abortController,
    middleware: [
      withPersistence(persistence),
      withLocks(locksFor(url)),
      withSandbox(sandbox, {
        runs,
        instances,
        durability: { adapter: log },
      }),
    ],
  })

  // `batch: 1` so every chunk reaches the client (and the log) as it is
  // produced: a test that disconnects mid-stream needs the prefix to be real.
  return toServerSentEventsResponse(stream, {
    durability: { adapter: log, batch: 1 },
    abortController,
  })
}

/**
 * Drive an already-detached run: tail the EXISTING journal instead of starting a
 * second agent, and align against the stored log.
 *
 * Shared by the attach route and the reaper on purpose. `sandboxRunDriver.drive`
 * and `ReapOptions.drive` take the same `{ runId, threadId, signal }`, and the
 * reaper's contract is that it drives a run the SAME way a viewer would — so a
 * second, subtly different producer here would let the reaper specs pass against
 * behavior the takeover specs never see.
 */
function driveDetachedRun(
  input: { runId: string; threadId: string; signal: AbortSignal },
  locks: LockStore,
): AsyncIterable<StreamChunk> {
  const abortController = controllerFor(input.signal)
  driving.set(input.runId, abortController)
  return chat({
    adapter: harnessAdapter,
    messages: [{ role: 'user', content: 'go' }],
    runId: input.runId,
    threadId: input.threadId,
    abortController,
    middleware: [
      withPersistence(persistence),
      withLocks(locks),
      withSandbox(sandbox, {
        runs,
        instances,
        durability: { adapter: logFor(input.runId), attach: true },
      }),
    ],
  })
}

function attachResponse(request: Request, url: URL): Response {
  const locks = locksFor(url)
  const runId = requiredParam(url, 'runId')
  return resumeServerSentEventsResponse({
    adapter: memoryStream(request),
    driver: sandboxRunDriver({
      request,
      runs,
      locks,
      durability: (driven) => logFor(driven),
      // Default is 5s; the journal only advances on an explicit tick, so a short
      // window keeps the suite fast without weakening what it proves.
      fenceQuietMs: intParam(url, 'fenceQuietMs', 50),
      drive: (input) => driveDetachedRun(input, locks),
    }),
    headers: { 'X-Run-Id': runId },
  })
}

// ---------------------------------------------------------------------------
// The reaper sweep.
// ---------------------------------------------------------------------------

/**
 * The run store the reaper is allowed to SELECT from, narrowed to the runIds the
 * request named.
 *
 * `reapDetachedRuns` sweeps every detached run `listReclaimable` surfaces, and
 * this suite is `fullyParallel` over one shared store — an unscoped sweep would
 * cancel and drive other tests' detached runs, and a future `now` would expire
 * them all. Narrowing the CANDIDATE LIST and nothing else keeps a sweep an
 * assertion about the runs one test constructed, which is also why the spec
 * asserts `considered`: a sweep over an empty candidate list satisfies every "the
 * reaper did not touch this" assertion, and that exact false pass is what the
 * leave-alone halves exist to rule out.
 */
function runsScopedTo(runIds: Array<string>): typeof runs {
  return {
    createOrResume: (input) => runs.createOrResume(input),
    update: (runId, patch) => runs.update(runId, patch),
    get: (runId) => runs.get(runId),
    listReclaimable: async (opts) => {
      const listed = (await runs.listReclaimable?.(opts)) ?? []
      return listed.filter((record) => runIds.includes(record.runId))
    },
  }
}

/**
 * The out-of-band exit probe, wired to the REAL {@link probeRunExit} against this
 * run's own sandbox handle.
 *
 * `ReapOptions.hasFinished` is injected precisely so this is the application's
 * job: the delivery log stops growing when the viewer leaves while the journal
 * keeps growing, and only the application can turn a `sandboxKey` into a handle.
 * A run with no `sandboxKey` therefore answers `'unknown'` — never `'finished'`,
 * which would have the reaper drive a live run.
 */
function probeFor(record: RunRecord): Promise<RunExitProbe> {
  const sandboxKey = record.sandboxKey
  if (sandboxKey === undefined) return Promise.resolve({ state: 'unknown' })
  return probeRunExit({ handle: fakeHandle(sandboxKey), runId: record.runId })
}

interface ReapBody {
  reap: ReapResult
  /** One journal-directory sweep per sandbox the named runs live in. */
  prune: Array<{ sandboxKey: string; result: PruneJournalsResult }>
}

/**
 * One reaper sweep plus the journal sweep that follows it, over the runIds the
 * request named (repeat `runId` to sweep several in ONE pass).
 *
 * `now` is injected rather than read, which is what makes the TTL boundary
 * deterministic without a fake clock anywhere: `ReapOptions.now` and
 * `detachedRunTtlMs` are explicit parameters, and `?action=seed` injects
 * `detachedSince`, so a spec supplies both sides of `detachedSince <= now - ttl`.
 *
 * `pruneJournals` runs AFTER the sweep and per sandbox, because it asks the store
 * whether each journal's run is terminal — the sweep is what makes a finalized
 * run's answer `terminal`, so running it first would report every journal as
 * `'non-terminal'` and prove nothing.
 */
async function reapResponse(url: URL): Promise<Response> {
  const runIds = url.searchParams.getAll('runId').filter((id) => id.length > 0)
  if (runIds.length === 0) {
    throw new Error('durable-takeover: reap requires at least one runId')
  }
  const now = intParam(url, 'now', Date.now())
  const locks = locksFor(url)
  const rawBudget = url.searchParams.get('runBudgetMs')

  const reap = await reapDetachedRuns({
    runs: runsScopedTo(runIds),
    locks,
    durability: (runId) => logFor(runId),
    hasFinished: probeFor,
    drive: (input) => driveDetachedRun(input, locks),
    now,
    detachedRunTtlMs: DETACHED_RUN_TTL_MS,
    ...(rawBudget === null
      ? {}
      : { runBudgetMs: intParam(url, 'runBudgetMs', 0) }),
    fenceQuietMs: intParam(url, 'fenceQuietMs', 50),
    reclaim: sandboxReclaimer({ provider, instances }),
  })

  const sandboxKeys = [
    ...new Set(
      runIds
        .map((runId) => journals.get(runId)?.sandboxKey)
        .filter((key): key is string => key !== undefined),
    ),
  ]
  const prune: ReapBody['prune'] = []
  for (const sandboxKey of sandboxKeys) {
    prune.push({
      sandboxKey,
      result: await pruneJournals({
        handle: fakeHandle(sandboxKey),
        runs,
        now,
      }),
    })
  }

  const body: ReapBody = { reap, prune }
  return Response.json(body)
}

/**
 * Opt a run's translator out of determinism for the rest of the process. Read on
 * every request so it can be set by the attach that must diverge, and never
 * cleared: every spec mints a unique `runId`.
 */
function applyTranslatorFlags(url: URL): void {
  if (url.searchParams.get('nondeterministic') !== '1') return
  const runId = url.searchParams.get('runId')
  if (runId !== null && runId.length > 0) nondeterministicRuns.add(runId)
}

export const Route = createFileRoute('/api/durable-takeover')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        applyTranslatorFlags(url)
        const action = url.searchParams.get('action')
        if (action === 'reap') return reapResponse(url)
        if (action === 'tick') {
          const runId = requiredParam(url, 'runId')
          return Response.json({
            journal: tickAgent(runId, intParam(url, 'n', 1)) ?? null,
          })
        }
        if (action === 'drop') return dropResponse(url)
        if (action === 'cancel') return cancelResponse(url)
        if (action === 'seed') return seedResponse(url)
        return startResponse(url)
      },
      GET: async ({ request }) => {
        const url = new URL(request.url)
        applyTranslatorFlags(url)
        if (url.searchParams.get('action') === 'state') {
          return stateResponse(url)
        }
        return attachResponse(request, url)
      },
    },
  },
})
