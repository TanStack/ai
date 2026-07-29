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
  alignedIfAttaching,
  createRunScopedIdGen,
  defineSandbox,
  defineWorkspace,
  getSandboxDurability,
  resolveDurableRunId,
  sandboxRunDriver,
  withSandbox,
} from '@tanstack/ai-sandbox'
import type { AnyTextAdapter, RunRecord, StreamChunk } from '@tanstack/ai'
import type { LockStore } from '@tanstack/ai/locks'
import type {
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
 * (`alignToStoredLog`), `sandboxRunDriver`'s claim and BOTH its fences, and
 * core's `startRunDriver`. Two things are stand-ins:
 *
 * - **The sandbox provider** is a fake handle (no container). It records every
 *   `destroy` per sandbox key, which is how "an explicit cancel tears the
 *   sandbox down" is asserted.
 * - **The agent's journal** is a counter instead of an NDJSON file inside the
 *   sandbox. The substitution keeps the property the journal exists for: the
 *   agent's output lives OUTSIDE the request, so it survives the client
 *   disconnect and a later attach re-reads it from the first line. The counter
 *   advances only on an explicit `?action=tick`, so a test controls exactly
 *   where mid-stream it disconnects — no timers, no sleeps, no flake.
 *
 * Provider-free (no LLM in the loop), so this route is exempt from the aimock
 * policy, like the other durability harness routes.
 *
 * Actions, all keyed by a caller-supplied `runId` that must be unique per test:
 *
 * - `POST ?runId&threadId&total` — start a fresh durable run over SSE.
 * - `POST ?action=tick&runId&n` — advance the agent's journal by `n` lines.
 * - `POST ?action=drop&runId` — the client disconnect (see `dropResponse`).
 * - `POST ?action=seed&runId&threadId&total&lines` — construct the takeover
 *   PRECONDITION directly: a running record, a detached marker, a live agent,
 *   and an OPEN log holding the prefix a previous host delivered. See
 *   "Why seeding exists" below.
 * - `GET  ?runId&offset=-1` — attach: replay the log AND take the run over.
 * - `POST ?action=cancel&runId&band=both|durable|inprocess` — out-of-band cancel.
 * - `GET  ?action=state&runId` — the observable server state, as JSON.
 *
 * WHY SEEDING EXISTS. A takeover's documented precondition is "record still
 * `running`, delivery log OPEN and holding what was already delivered, agent
 * still working". A real client disconnect does not currently produce that:
 * core's durable delivery sink appends a terminal `RUN_ERROR` ("Request
 * aborted") and calls `durability.close()` on the abort path
 * (`packages/ai/src/stream-to-response.ts`, `needsTerminalPersistence`), so the
 * log is terminalized. `?action=seed` writes the intended precondition with the
 * same translator a live host would have used, so the takeover machinery can be
 * exercised for what it is. The disconnect→takeover path is pinned separately
 * (and currently fails) in the spec.
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

function contentChunk(messageId: string, line: number): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: String(line),
    content: String(line),
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
  const genId = createRunScopedIdGen(runId)
  const messageId = genId()
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
      exec: () => Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
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
  /** The run's delivery log, reduced to what the assertions read. */
  log: Array<{ type: string; delta?: string }>
}

async function stateResponse(url: URL): Promise<Response> {
  const runId = requiredParam(url, 'runId')
  const snapshot = await logFor(runId).snapshot()
  const journal = journals.get(runId) ?? null
  const body: StateBody = {
    record: await runs.get(runId),
    attachDrives: attachDrives.get(runId) ?? 0,
    attachChunks: attachChunks.get(runId) ?? 0,
    attachDriveEnds: attachDriveEnds.get(runId) ?? 0,
    sandboxDestroyed:
      journal !== null && destroyedSandboxes.includes(journal.sandboxKey),
    journal,
    log: snapshot.map((entry) => {
      const delta: unknown = Reflect.get(entry.chunk, 'delta')
      return {
        type: entry.chunk.type,
        ...(typeof delta === 'string' ? { delta } : {}),
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

  const journal = startAgent(runId, threadId, total)
  tickAgent(runId, lines)
  await runs.createOrResume({ runId, threadId, startedAt: Date.now() })
  await runs.update(runId, {
    detachedSince: Date.now(),
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
        durability: { adapter: log, detachedRunTtl: '5m' },
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
      drive: (input) => {
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
              // The whole difference: tail the EXISTING journal instead of
              // starting a second agent, and align against the stored log.
              durability: { adapter: logFor(input.runId), attach: true },
            }),
          ],
        })
      },
    }),
    headers: { 'X-Run-Id': runId },
  })
}

export const Route = createFileRoute('/api/durable-takeover')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const action = url.searchParams.get('action')
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
        if (url.searchParams.get('action') === 'state') {
          return stateResponse(url)
        }
        return attachResponse(request, url)
      },
    },
  },
})
