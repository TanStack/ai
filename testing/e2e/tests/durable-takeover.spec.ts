import { expect, test } from '@playwright/test'

/**
 * Durable, detachable sandboxed runs over real HTTP.
 *
 * The five behaviors this phase added, each pinned here:
 *
 * 1. A takeover resumes a detached run and delivers the remainder with the
 *    delivered prefix suppressed — the log holds each chunk exactly once. Pinned
 *    both from a seeded precondition and from a REAL disconnect.
 * 2. A plain disconnect does NOT terminalize the run: the record stays
 *    `'running'` with no `finishedAt` and no `error`, and gains `detachedSince`
 *    + `sandboxKey`.
 * 3. An explicit cancel DOES tear down — in either band — destroying the
 *    sandbox and writing a terminal `'aborted'`.
 * 4. Cancel and disconnect are distinguished even though the connection close is
 *    byte-identical.
 * 5. A superseded driver corrupts nothing: it writes NOTHING to the log (not
 *    even an error chunk) and cannot mark the record terminal, while the winner
 *    completes normally.
 * 6. The reaper handles the case every other test here leaves hanging — nobody
 *    ever comes back: it finalizes a run that reached its sentinel while
 *    detached (which is the only way that transcript is ever saved), expires one
 *    past its TTL, and leaves a still-producing one completely untouched.
 * 7. A replay that stopped being deterministic fails the attach LOUDLY instead of
 *    delivering the prefix twice.
 *
 * Harness: `/api/durable-takeover`. Provider-free (no LLM), so it is exempt from
 * the aimock policy like the other durability harness routes. The agent's
 * journal advances only on an explicit `?action=tick`, so every disconnect
 * happens at a known point in the stream — no timers, no sleeps.
 *
 * Every test mints its own `runId`, because shared run state has produced false
 * passes on this feature before, and every wait is explicitly bounded: an attach
 * against a run with no journal used to hang forever, and a hung test stalls CI
 * instead of failing it.
 */

/**
 * Generous per-test budget, deliberately larger than every wait inside these
 * tests. These specs share one dev server with the rest of the suite, and under
 * full parallel load a correct run can be slow; each wait below has its own
 * explicit, shorter deadline with a message that says what it was waiting for,
 * so a real failure still reports itself instead of being cut off by the runner.
 */
test.beforeEach(() => {
  test.setTimeout(60_000)
})

const ROUTE = '/api/durable-takeover'

interface SseEvent {
  id: string
  data: Record<string, unknown>
}

interface RunRecordBody {
  runId: string
  threadId: string
  status: string
  startedAt: number
  finishedAt?: number
  error?: unknown
  detachedSince?: number
  sandboxKey?: string
  cancelRequested?: boolean
  driverEpoch?: number
}

interface StateBody {
  record: RunRecordBody | null
  attachDrives: number
  attachChunks: number
  attachDriveEnds: number
  sandboxDestroyed: boolean
  journal: {
    lines: number
    total: number
    done: boolean
    killed: boolean
  } | null
  /** Whether this run's journal file still exists in its sandbox. */
  journalFile: boolean
  /** The transcript `withPersistence.onFinish` saved for this run's thread. */
  messages: Array<{ role: string; text: string }>
  log: Array<{ type: string; delta?: string; message?: string }>
}

/** One run's line in a sweep summary (`ReapRunEntry`). */
interface ReapEntry {
  runId: string
  outcome: string
  status?: string
  exitCode?: number
  terminalizedAnyway?: boolean
}

interface ReapSummary {
  considered: number
  probed: number
  outcomes: Record<string, number>
  runs: Array<ReapEntry>
}

interface PruneSummary {
  listed: number
  runIds: number
  deleted: Array<string>
  kept: Array<{ runId?: string; names: Array<string>; reason: string }>
  ageGate: string
  failures: Array<unknown>
}

interface ReapBody {
  reap: ReapSummary
  prune: Array<{ sandboxKey: string; result: PruneSummary }>
}

/**
 * The harness's `detachedRunTtl`, in milliseconds. The route passes the same
 * value to `withSandbox` and to `reapDetachedRuns`, so this is the cutoff the
 * boundary cases below are constructed against.
 */
const DETACHED_RUN_TTL_MS = 5 * 60 * 1000

function baseUrl(): string {
  const url = test.info().project.use.baseURL
  if (typeof url !== 'string') {
    throw new Error('durable-takeover: no baseURL configured for this project')
  }
  return url
}

function routeUrl(params: Record<string, string>): string {
  const url = new URL(ROUTE, baseUrl())
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

function uniqueRunId(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Parse whole SSE blocks out of a decoded buffer, returning the remainder. */
function drainBlocks(buffer: string): {
  events: Array<SseEvent>
  rest: string
} {
  const events: Array<SseEvent> = []
  let rest = buffer
  for (;;) {
    const boundary = rest.indexOf('\n\n')
    if (boundary === -1) break
    const block = rest.slice(0, boundary)
    rest = rest.slice(boundary + 2)
    if (block.trim().length === 0) continue
    const lines = block.split('\n')
    const idLine = lines.find((line) => line.startsWith('id:'))
    const dataLine = lines.find((line) => line.startsWith('data:'))
    if (!dataLine) continue
    const raw = dataLine.slice(dataLine.indexOf(':') + 1).trim()
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) continue
    events.push({
      id: idLine ? idLine.slice(idLine.indexOf(':') + 1).trim() : '',
      data: { ...parsed },
    })
  }
  return { events, rest }
}

function eventType(event: SseEvent): string {
  const type = event.data.type
  return typeof type === 'string' ? type : '<untyped>'
}

function contentDeltas(events: Array<SseEvent>): Array<string> {
  return events
    .filter((event) => eventType(event) === 'TEXT_MESSAGE_CONTENT')
    .map((event) => {
      const delta = event.data.delta
      return typeof delta === 'string' ? delta : ''
    })
}

/**
 * A live SSE reader over `fetch`, so a test can disconnect at a chosen point in
 * the stream — which Playwright's `request` fixture cannot express.
 *
 * Every wait is bounded and every failure names what it was waiting for.
 */
class SseStream {
  private buffer = ''
  private readonly received: Array<SseEvent> = []
  private reader: ReadableStreamDefaultReader<Uint8Array> | undefined =
    undefined
  private readonly decoder = new TextDecoder()
  private ended = false

  private constructor(
    response: Response,
    private readonly controller: AbortController,
  ) {
    const body = response.body
    if (!body) throw new Error('durable-takeover: response had no body')
    this.reader = body.getReader()
  }

  static async open(url: string, init: RequestInit = {}): Promise<SseStream> {
    const controller = new AbortController()
    const response = await fetch(url, {
      method: 'POST',
      ...init,
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(
        `durable-takeover: ${url} responded ${response.status} ${await response.text()}`,
      )
    }
    return new SseStream(response, controller)
  }

  /** Read until `count` events have arrived, or fail after `timeoutMs`. */
  async take(count: number, timeoutMs = 15_000): Promise<Array<SseEvent>> {
    const deadline = Date.now() + timeoutMs
    while (this.received.length < count && !this.ended) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        throw new Error(
          `durable-takeover: timed out after ${timeoutMs}ms waiting for ${count} SSE events; got ${this.received.length} (${this.received.map(eventType).join(', ')})`,
        )
      }
      await this.pump(remaining)
    }
    if (this.received.length < count) {
      throw new Error(
        `durable-takeover: stream ended with ${this.received.length}/${count} events (${this.received.map(eventType).join(', ')})`,
      )
    }
    return this.received.slice(0, count)
  }

  /** Read until the stream ends, or fail after `timeoutMs`. */
  async drain(timeoutMs = 20_000): Promise<Array<SseEvent>> {
    const deadline = Date.now() + timeoutMs
    while (!this.ended) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        throw new Error(
          `durable-takeover: timed out after ${timeoutMs}ms draining the stream; got ${this.received.length} events (${this.received.map(eventType).join(', ')})`,
        )
      }
      await this.pump(remaining)
    }
    return this.received.slice()
  }

  private async pump(timeoutMs: number): Promise<void> {
    const reader = this.reader
    if (!reader) {
      this.ended = true
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs)
    })
    try {
      const step = await Promise.race([reader.read(), timeout])
      if (step === 'timeout') return
      if (step.done) {
        this.ended = true
        return
      }
      this.buffer += this.decoder.decode(step.value, { stream: true })
      const { events, rest } = drainBlocks(this.buffer)
      this.buffer = rest
      this.received.push(...events)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  /** Stop reading and release the socket. Not a server-observable disconnect. */
  close(): void {
    this.controller.abort()
    this.reader = undefined
    this.ended = true
  }
}

/**
 * The client disconnect.
 *
 * Injected server-side rather than produced by closing the test's own socket:
 * a `fetch` abort does not propagate to the server through this app's dev
 * server (verified — the run keeps producing and `withSandbox.onAbort` never
 * runs), so a test cannot observe a real socket close from here. `?action=drop`
 * aborts the run's own `AbortController` with NO reason, which is exactly what
 * the transport does when the socket goes away, and the absence of a reason is
 * the entire difference from a cancel. See `dropResponse` in the harness route.
 */
async function drop(runId: string, stream?: SseStream): Promise<void> {
  const response = await fetch(routeUrl({ action: 'drop', runId }), {
    method: 'POST',
  })
  expect(response.ok, 'drop should succeed').toBe(true)
  const body: unknown = await response.json()
  expect(
    typeof body === 'object' &&
      body !== null &&
      Reflect.get(body, 'dropped') === true,
    'drop should have found a live run to disconnect',
  ).toBe(true)
  stream?.close()
}

async function tick(runId: string, n = 1): Promise<void> {
  const response = await fetch(
    routeUrl({ action: 'tick', runId, n: String(n) }),
    {
      method: 'POST',
    },
  )
  expect(response.ok, 'tick should succeed').toBe(true)
  await response.json()
}

/**
 * Construct the detached precondition, and answer with the sandbox key it was
 * built under so a spec can address that sandbox's journal-sweep summary.
 *
 * `detachedSince` is injectable because the reaper's TTL boundary is
 * `detachedSince <= now - ttl` and `?action=reap` injects `now`: with both sides
 * supplied, "past the TTL" and "one millisecond inside it" are exact, with no
 * fake clock and no dependence on how long a request took.
 */
async function seed(params: {
  runId: string
  threadId?: string
  total?: number
  lines?: number
  detachedSince?: number
}): Promise<string> {
  const response = await fetch(
    routeUrl({
      action: 'seed',
      runId: params.runId,
      ...(params.threadId === undefined ? {} : { threadId: params.threadId }),
      total: String(params.total ?? 6),
      lines: String(params.lines ?? 2),
      ...(params.detachedSince === undefined
        ? {}
        : { detachedSince: String(params.detachedSince) }),
    }),
    { method: 'POST' },
  )
  expect(response.ok, 'seed should succeed').toBe(true)
  const body: unknown = await response.json()
  const sandboxKey =
    typeof body === 'object' && body !== null
      ? Reflect.get(body, 'sandboxKey')
      : undefined
  if (typeof sandboxKey !== 'string') {
    throw new Error('durable-takeover: seed did not answer with a sandboxKey')
  }
  return sandboxKey
}

/**
 * Run ONE reaper sweep over exactly the runIds named, then the journal sweep.
 *
 * Several runIds in one call on purpose: every case below asserts both that the
 * reaper acted on the run it should AND that it left a specifically-constructed
 * run alone, and asserting both against the SAME sweep is what makes the second
 * half mean something — a sweep that considered nothing satisfies every
 * "untouched" assertion on its own.
 */
async function reap(params: {
  runIds: Array<string>
  now: number
  runBudgetMs?: number
}): Promise<ReapBody> {
  const url = new URL(ROUTE, baseUrl())
  url.searchParams.set('action', 'reap')
  for (const runId of params.runIds) url.searchParams.append('runId', runId)
  url.searchParams.set('now', String(params.now))
  if (params.runBudgetMs !== undefined) {
    url.searchParams.set('runBudgetMs', String(params.runBudgetMs))
  }
  const response = await fetch(url.toString(), { method: 'POST' })
  expect(response.ok, `reap should succeed (${response.status})`).toBe(true)
  const body: unknown = await response.json()
  if (typeof body !== 'object' || body === null) {
    throw new Error('durable-takeover: reap response was not an object')
  }
  return body as ReapBody
}

/** The sweep's line for one run, so a missing entry fails loudly. */
function reapEntry(body: ReapBody, runId: string): ReapEntry {
  const entry = body.reap.runs.find((candidate) => candidate.runId === runId)
  if (entry === undefined) {
    throw new Error(
      `durable-takeover: the sweep has no entry for ${runId}; summary ${JSON.stringify(body.reap)}`,
    )
  }
  return entry
}

/** The journal-sweep summary for one sandbox. */
function pruneFor(body: ReapBody, sandboxKey: string): PruneSummary {
  const entry = body.prune.find(
    (candidate) => candidate.sandboxKey === sandboxKey,
  )
  if (entry === undefined) {
    throw new Error(
      `durable-takeover: no journal sweep for sandbox ${sandboxKey}; got ${body.prune.map((p) => p.sandboxKey).join(', ')}`,
    )
  }
  return entry.result
}

async function cancel(
  runId: string,
  band: 'both' | 'durable' | 'inprocess',
): Promise<void> {
  const response = await fetch(routeUrl({ action: 'cancel', runId, band }), {
    method: 'POST',
  })
  expect(response.status, 'cancel should be 204').toBe(204)
}

async function state(runId: string): Promise<StateBody> {
  const response = await fetch(routeUrl({ action: 'state', runId }))
  expect(response.ok, 'state should succeed').toBe(true)
  const body: unknown = await response.json()
  if (typeof body !== 'object' || body === null) {
    throw new Error('durable-takeover: state response was not an object')
  }
  return body as StateBody
}

/** Poll `state` until `predicate` holds, with an explicit bound. */
async function stateUntil(
  runId: string,
  what: string,
  predicate: (body: StateBody) => boolean,
  timeoutMs = 15_000,
): Promise<StateBody> {
  const deadline = Date.now() + timeoutMs
  let last: StateBody | undefined
  for (;;) {
    last = await state(runId)
    if (predicate(last)) return last
    if (Date.now() > deadline) {
      throw new Error(
        `durable-takeover: timed out after ${timeoutMs}ms waiting for ${what}; last state ${JSON.stringify(last)}`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/** The full, correct chunk sequence for a six-line run. */
const FULL_SEQUENCE = [
  'RUN_STARTED',
  'TEXT_MESSAGE_START',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_END',
  'RUN_FINISHED',
]

/** The full, correct chunk sequence for a TWO-line run. */
const TWO_LINE_SEQUENCE = [
  'RUN_STARTED',
  'TEXT_MESSAGE_START',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_END',
  'RUN_FINISHED',
]

/** What a previous host had already delivered when it went away: two lines. */
const DELIVERED_PREFIX = [
  'RUN_STARTED',
  'TEXT_MESSAGE_START',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_CONTENT',
]

/**
 * The leave-alone half of a sweep, asserted as one whole.
 *
 * Every field here is one the reaper could have moved and must not have:
 * `pipeToRunLog` is total, so entering it AT ALL writes a terminal status, closes
 * the log and — on the expiry path — records a cancel. `detachedSince` is the
 * sharpest of them: it is both this run's TTL evidence and the field the next
 * sweep selects on, so a sweep that refreshed or cleared it would make the run
 * either immortal or invisible, and neither shows up in a status assertion.
 */
function expectUntouched(before: StateBody, after: StateBody): void {
  expect(after.record?.status, 'an untouched run stays running').toBe('running')
  expect(after.record?.cancelRequested).toBeUndefined()
  expect(after.record?.finishedAt).toBeUndefined()
  expect(after.record?.error).toBeUndefined()
  expect(
    after.record?.detachedSince,
    'detachedSince must be the very same instant, not a refreshed one',
  ).toBe(before.record?.detachedSince)
  // Not even the claim was taken: the leave-alone path returns before
  // `withRunClaim`, so the epoch cannot have moved.
  expect(after.record?.driverEpoch).toBe(before.record?.driverEpoch)
  // Nothing appended and nothing closed.
  expect(after.log.map((entry) => entry.type)).toEqual(
    before.log.map((entry) => entry.type),
  )
  expect(after.log.map((entry) => entry.delta)).toEqual(
    before.log.map((entry) => entry.delta),
  )
  // No transcript was saved: `withPersistence.onFinish` never ran.
  expect(after.messages).toEqual([])
  // The agent is still alive in a sandbox that is still up.
  expect(after.sandboxDestroyed).toBe(false)
  expect(after.journal?.killed).toBe(false)
  expect(after.journal?.lines).toBe(before.journal?.lines)
  // And its journal — the only copy of the bytes a successor would replay — is
  // still on disk.
  expect(after.journalFile).toBe(true)
}

/**
 * What the sweep reports for a run it expired while its agent was STILL WORKING.
 *
 * `'expired'`, which is what the TTL path is FOR. It read `'budget-exceeded'`
 * while two defects stacked. Nothing polls `RunRecord.cancelRequested` to abort a
 * live drive — `wasCancelRequested` has exactly one reader, `withSandbox`'s
 * `onAbort`, which runs only once something else has already aborted — so
 * `ReapOptions.runBudgetMs` is the only thing that ends this drive; and `reap.ts`
 * used to label ANY budget expiry the anomaly it only is on the finalization path,
 * where the probe already said the agent was done. On the expiry path the budget is
 * the designed stop, so `'expired'` is now reported and the anomaly is reserved for
 * the case that really is one.
 */
const EXPIRED_LIVE_OUTCOME = 'expired'

/**
 * The acted-on half of an expiry: the run is terminal, the sandbox is gone, and
 * nothing was invented about what the agent produced.
 *
 * The terminal STATUS is `'aborted'`, pinned exactly. It used to be `'completed'`
 * — `pipeToRunLog` checked its abort signal only per chunk, so a signal-aware
 * producer that ended its stream made the loop exit normally and the success path
 * ran — which meant a run the reaper had force-expired, and whose sandbox it had
 * just destroyed, was recorded as having completed successfully. `not.toBe(
 * 'running')` is the assertion that let that through: `'completed'` is terminal
 * too. The two facts below are the other half of the same guard, against the
 * danger in terminalizing a live run at all: no synthesized chunk in the log, and
 * no invented assistant turn in the transcript.
 */
async function expectExpiredAndTornDown(runId: string): Promise<StateBody> {
  const after = await stateUntil(
    runId,
    'the expired run to reach a terminal status',
    (body) => body.record?.finishedAt !== undefined,
  )
  // Recorded BEFORE the drive, which is what makes the teardown an explicit
  // cancel that DESTROYS the sandbox rather than a second detach that re-arms
  // `detachedSince` and leaves the run to be swept forever.
  expect(after.record?.cancelRequested).toBe(true)
  // The agent was mid-sentence when the reaper stopped it. Anything but
  // `'aborted'` here is a transcript that claims something that did not happen.
  expect(after.record?.status).toBe('aborted')
  expect(typeof after.record?.finishedAt).toBe('number')
  // The cost leak is closed: the agent cannot keep burning tokens in a sandbox
  // nobody is reading.
  expect(after.sandboxDestroyed).toBe(true)
  expect(after.journal?.killed).toBe(true)
  // The log holds what was really delivered and nothing else — no synthetic
  // terminal, no error chunk.
  expect(after.log.map((entry) => entry.type)).toEqual(DELIVERED_PREFIX)
  expect(after.log.filter((entry) => entry.type === 'RUN_ERROR')).toEqual([])
  // And no assistant turn was invented for output the agent never finished.
  expect(
    after.messages.filter((message) => message.role === 'assistant'),
  ).toEqual([])
  return after
}

// ---------------------------------------------------------------------------
// 1. Takeover
// ---------------------------------------------------------------------------

test.describe('durable runs — takeover', () => {
  test('an attach takes the detached run over and delivers the remainder exactly once', async () => {
    const runId = uniqueRunId('takeover')
    // The takeover precondition: a running record, a detached marker, an agent
    // that has written 2 of 6 lines, and an OPEN log holding the 4 chunks a
    // previous host already delivered.
    await seed({ runId, total: 6, lines: 2 })

    const attach = await SseStream.open(routeUrl({ runId, offset: '-1' }), {
      method: 'GET',
    })

    // The replayed prefix arrives first, from the log.
    const prefix = await attach.take(4)
    expect(prefix.map(eventType)).toEqual([
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
    ])
    expect(contentDeltas(prefix)).toEqual(['1', '2'])

    // The driver has claimed the run and is tailing the journal. Let the agent
    // finish; the remaining four lines must arrive on THIS connection.
    await stateUntil(
      runId,
      'the takeover to claim the run (driverEpoch)',
      (body) => (body.record?.driverEpoch ?? 0) >= 1,
    )
    await tick(runId, 4)

    const delivered = await attach.drain()

    // THE assertion: the delivered sequence is exactly the run's chunk sequence.
    // A takeover that replayed the journal without aligning would deliver
    // '1','2','1','2','3'… and the user would see the prefix twice.
    expect(delivered.map(eventType)).toEqual(FULL_SEQUENCE)
    expect(contentDeltas(delivered)).toEqual(['1', '2', '3', '4', '5', '6'])
    // Offsets are opaque, but each event must carry its own — no reuse.
    const offsets = delivered.map((event) => event.id)
    expect(new Set(offsets).size).toBe(offsets.length)

    // The record: the detached clock stopped and the run completed for real.
    const after = await stateUntil(
      runId,
      'the taken-over run to reach a terminal status',
      (body) => body.record?.status === 'completed',
    )
    expect(after.record?.detachedSince).toBeUndefined()
    expect(after.record?.error).toBeUndefined()
    // The log itself holds each chunk once — nothing was appended twice.
    expect(after.log.map((entry) => entry.type)).toEqual(FULL_SEQUENCE)
  })

  /**
   * The disconnect→takeover path end to end, which is what the docs promise:
   * a run streaming mid-flight, the tab goes away, the stream continues.
   *
   * This case was `test.fail()` while core's durable delivery sink terminalized
   * EVERY abort — it appended a synthetic `RUN_ERROR` ("Request aborted") and
   * called `durability.close()` unconditionally, so a detached run's log ended at
   * that error. A later attach's replay stopped at the prefix, and the stored
   * `RUN_ERROR` was a chunk the journal replay could not reproduce, so
   * `alignToStoredLog` diverged and `pipeToRunLog` recorded the healthy detached
   * run as `'failed'`.
   *
   * The sink now consults the run's own detach verdict
   * (`RunDetachedCapability`, published by `withSandbox`'s detach branch and
   * carried to the transport on the stream itself), so a plain disconnect of a
   * detachable run leaves the log OPEN. Both halves of the assertion below are
   * load bearing: the remainder must arrive on the attach's socket, AND the
   * record must not be `'failed'`.
   */
  test('a real disconnect, then an attach, continues the stream', async () => {
    const runId = uniqueRunId('disconnect-takeover')
    const run = await SseStream.open(routeUrl({ runId, total: '6' }))
    await tick(runId, 2)
    const before = await run.take(4)
    expect(contentDeltas(before)).toEqual(['1', '2'])
    await drop(runId, run)

    await stateUntil(
      runId,
      'the run to be marked detached',
      (body) => typeof body.record?.detachedSince === 'number',
    )

    const attach = await SseStream.open(routeUrl({ runId, offset: '-1' }), {
      method: 'GET',
    })
    await stateUntil(
      runId,
      'the takeover to claim the detached run (driverEpoch)',
      (body) => (body.record?.driverEpoch ?? 0) >= 1,
    )
    await tick(runId, 4)
    const delivered = await attach.drain()

    expect(delivered.map(eventType)).toEqual(FULL_SEQUENCE)
    expect(contentDeltas(delivered)).toEqual(['1', '2', '3', '4', '5', '6'])

    // The run completed for real — NOT recorded as failed by a diverged replay.
    const after = await stateUntil(
      runId,
      'the taken-over run to reach a terminal status',
      (body) => body.record?.status === 'completed',
    )
    expect(after.record?.status).not.toBe('failed')
    expect(after.record?.error).toBeUndefined()
    expect(after.record?.detachedSince).toBeUndefined()
    // And the log holds each chunk exactly once, with no stored RUN_ERROR.
    expect(after.log.map((entry) => entry.type)).toEqual(FULL_SEQUENCE)
  })
})

// ---------------------------------------------------------------------------
// 2. A plain disconnect is not a terminal event
// ---------------------------------------------------------------------------

test.describe('durable runs — disconnect', () => {
  test('a plain disconnect does not terminalize the run', async () => {
    const runId = uniqueRunId('detach')
    const run = await SseStream.open(routeUrl({ runId, total: '6' }))
    await tick(runId, 2)
    expect(contentDeltas(await run.take(4))).toEqual(['1', '2'])

    await drop(runId, run)

    const body = await stateUntil(
      runId,
      'the run to be marked detached',
      (record) => typeof record.record?.detachedSince === 'number',
    )
    // withPersistence writes NOTHING on this branch: the run is still going.
    expect(body.record?.status).toBe('running')
    expect(body.record?.finishedAt).toBeUndefined()
    expect(body.record?.error).toBeUndefined()
    // withSandbox records the two facts a later attach and the reaper need.
    expect(typeof body.record?.detachedSince).toBe('number')
    expect(typeof body.record?.sandboxKey).toBe('string')
    // And the sandbox is still up, so the agent keeps working.
    expect(body.sandboxDestroyed).toBe(false)
    expect(body.journal?.killed).toBe(false)

    // Proof the agent really did outlive the connection: it can still advance.
    await tick(runId, 1)
    const advanced = await state(runId)
    expect(advanced.journal?.lines).toBe(3)
    expect(advanced.journal?.killed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. An explicit cancel tears down — in either band
// ---------------------------------------------------------------------------

test.describe('durable runs — cancel', () => {
  for (const band of ['durable', 'inprocess'] as const) {
    test(`an explicit cancel in the ${band} band destroys the sandbox and ends the run`, async () => {
      const runId = uniqueRunId(`cancel-${band}`)
      const run = await SseStream.open(routeUrl({ runId, total: '6' }))
      await tick(runId, 2)
      expect(contentDeltas(await run.take(4))).toEqual(['1', '2'])

      await cancel(runId, band)
      if (band === 'durable') {
        // The durable band records intent only — `requestRunCancel` deliberately
        // writes no status. The teardown happens on the run's next teardown,
        // which for a remote driver is its own disconnect, and here is this
        // client going away.
        await drop(runId, run)
      } else {
        // The in-process band already aborted the run's controller with
        // RUN_CANCEL_REASON, so the teardown has begun; nothing else to do.
        run.close()
      }

      const body = await stateUntil(
        runId,
        'the cancelled run to reach a terminal status',
        (record) => record.record?.status === 'aborted',
      )
      expect(body.record?.status).toBe('aborted')
      expect(typeof body.record?.finishedAt).toBe('number')
      // A cancel is not a detach: the sandbox goes, always.
      expect(body.sandboxDestroyed).toBe(true)
      expect(body.journal?.killed).toBe(true)
      // The agent is dead, so the journal cannot advance any further.
      const linesAtCancel = body.journal?.lines
      await tick(runId, 2)
      expect((await state(runId)).journal?.lines).toBe(linesAtCancel)
    })
  }

  // ------------------------------------------------------------------------
  // 4. The two are distinguished, though the close is identical
  // ------------------------------------------------------------------------

  test('cancel and disconnect diverge even though the connection close is identical', async () => {
    // Two runs, the SAME client-side action on both — drop the connection. The
    // only difference is that one had a cancel recorded out of band first.
    const dropped = uniqueRunId('diverge-dropped')
    const cancelled = uniqueRunId('diverge-cancelled')

    const droppedRun = await SseStream.open(routeUrl({ runId: dropped }))
    const cancelledRun = await SseStream.open(routeUrl({ runId: cancelled }))
    await tick(dropped, 2)
    await tick(cancelled, 2)
    await droppedRun.take(4)
    await cancelledRun.take(4)

    // Out of band, and only for one of them.
    await cancel(cancelled, 'durable')

    // Byte-identical connection close from here: the SAME plain abort, with no
    // reason, on both runs.
    await drop(dropped, droppedRun)
    await drop(cancelled, cancelledRun)

    // Waits for each teardown to have SETTLED either way — detached or terminal —
    // rather than for the outcome under test. Waiting for the expected outcome
    // would turn a wrong verdict into a timeout; this way a wrong verdict lands
    // on the divergence assertions below, which say what actually went wrong.
    const settled = (body: StateBody): boolean =>
      typeof body.record?.detachedSince === 'number' ||
      body.record?.finishedAt !== undefined
    const droppedState = await stateUntil(
      dropped,
      "the dropped run's teardown to settle",
      settled,
    )
    const cancelledState = await stateUntil(
      cancelled,
      "the cancelled run's teardown to settle",
      settled,
    )

    // The divergence, asserted as a divergence and not as two isolated facts.
    expect(droppedState.record?.status).toBe('running')
    expect(cancelledState.record?.status).toBe('aborted')
    expect(droppedState.record?.status).not.toBe(cancelledState.record?.status)
    expect(droppedState.sandboxDestroyed).toBe(false)
    expect(cancelledState.sandboxDestroyed).toBe(true)
    expect(droppedState.journal?.killed).toBe(false)
    expect(cancelledState.journal?.killed).toBe(true)
    expect(droppedState.record?.finishedAt).toBeUndefined()
    expect(typeof cancelledState.record?.finishedAt).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// 5. A superseded driver corrupts nothing
// ---------------------------------------------------------------------------

test.describe('durable runs — single-writer fencing', () => {
  test('a superseded driver writes nothing to the log and cannot mark the run terminal', async () => {
    const runId = uniqueRunId('fence')
    await seed({ runId, total: 6, lines: 2 })

    // `locks=permissive` models a lease-less lock so the two drives actually
    // OVERLAP. `InMemoryLockStore` serializes them inside one process, which
    // would make the fence unobservable (see the harness route's comment and
    // `packages/ai-sandbox/src/claim.ts`).
    const first = await SseStream.open(
      routeUrl({ runId, offset: '-1', locks: 'permissive' }),
      { method: 'GET' },
    )
    const loser = await stateUntil(
      runId,
      'the first driver to claim the run and replay the stored prefix',
      // Four produced chunks means this driver is PAST `awaitLogQuiescence` and
      // past `alignToStoredLog`'s one eager snapshot. That precondition is what
      // makes this a test of the EPOCH fence (layer 2) specifically: superseded
      // before the snapshot, the loser is stopped by quiescence (layer 3)
      // instead, and the test would pass with the epoch fence removed —
      // verified, so this wait is load bearing.
      (body) => (body.record?.driverEpoch ?? 0) >= 1 && body.attachChunks >= 4,
    )
    expect(loser.record?.driverEpoch).toBe(1)

    // A second attach supersedes it. The journal has produced nothing new yet,
    // so neither driver has appended: the loser's first append will come AFTER
    // it has been superseded, which is the case being fenced.
    const second = await SseStream.open(
      routeUrl({ runId, offset: '-1', locks: 'permissive' }),
      { method: 'GET' },
    )
    await stateUntil(
      runId,
      'the second driver to supersede the first',
      (body) => (body.record?.driverEpoch ?? 0) >= 2,
    )

    await tick(runId, 4)

    // Deliberately NOT asserted on the winner's socket: the loser's teardown
    // calls `durability.close()`, which is UNFENCED on purpose (a fenced close
    // would wedge the record at 'running' with every tailer parked forever), so
    // a live reader can be terminalized early by the loser. The authoritative
    // facts are the log and the record, and that is what is asserted.
    await stateUntil(
      runId,
      'the winning driver to complete the run',
      (record) => record.record?.status === 'completed',
    )

    // Then LET THE LOSER FINISH, and wait for a FACT rather than a duration:
    // both drives must have produced their full ten-chunk sequence. Asserting the
    // instant the winner completes makes this test pass even with the fence
    // removed, because the loser's refused writes are still in flight —
    // verified: with `fenceDurability` stubbed out, the loser's duplicate
    // '3','4','5','6' + terminal land AFTER the winner's completion. The point of
    // the test is what the loser could NOT do, so it has to have tried first.
    await stateUntil(
      runId,
      'both drivers to finish producing their remainder',
      (record) => record.attachDriveEnds >= 2,
    )
    // A short settle after BOTH drives stopped producing, so any append the
    // loser had in flight has landed before the log is judged.
    await new Promise((resolve) => setTimeout(resolve, 500))
    const body = await state(runId)

    // Two drivers really did drive, and both really did produce the remainder.
    // Without this, "the log has no duplicates" is also satisfied by a second
    // driver that never ran — a false pass.
    expect(body.attachDrives).toBe(2)

    // The winner completed normally...
    expect(body.record?.status).toBe('completed')
    expect(body.record?.error).toBeUndefined()
    // ...and the loser wrote NOTHING: no duplicated chunk, and no error chunk
    // either. A fence on the log alone would leave a `RUN_ERROR` here; a fence
    // on the record alone would leave duplicated deltas.
    expect(body.log.map((entry) => entry.type)).toEqual(FULL_SEQUENCE)
    expect(body.log.filter((entry) => entry.type === 'RUN_ERROR')).toEqual([])
    expect(
      body.log
        .filter((entry) => entry.type === 'TEXT_MESSAGE_CONTENT')
        .map((entry) => entry.delta),
    ).toEqual(['1', '2', '3', '4', '5', '6'])

    first.close()
    second.close()
  })
})

// ---------------------------------------------------------------------------
// 6. The reaper: nobody came back
// ---------------------------------------------------------------------------

/**
 * A detached run whose viewer never returns is the case every other test here
 * leaves hanging: the takeover tests all end with somebody attaching. Nothing in
 * the library drives such a run — `reapDetachedRuns` is a plain function an
 * application calls from a cron — so these cases call it over real HTTP and assert
 * what it did to the store, the log, the saved transcript, the sandbox and the
 * journal directory.
 *
 * EVERY case sweeps TWO runs in ONE pass and asserts both halves. That is not
 * symmetry for its own sake: a sweep whose candidate list came back empty
 * satisfies every "the reaper did not touch this run" assertion by doing nothing
 * at all, so the acted-on half — plus `considered` — is what makes the untouched
 * half evidence rather than decoration.
 *
 * `now` is injected on `?action=reap` and `detachedSince` on `?action=seed`, so
 * both sides of the reaper's `detachedSince <= now - ttl` are supplied by the
 * test. No fake clock, and no dependence on how long a request took.
 */
test.describe('durable runs — the reaper', () => {
  test('finalizes a run that reached its sentinel while detached, and leaves a still-producing one alone', async () => {
    const finished = uniqueRunId('reap-finalized')
    const producing = uniqueRunId('reap-producing')
    const now = Date.now()

    const finishedSandbox = await seed({
      runId: finished,
      total: 6,
      lines: 2,
      detachedSince: now,
    })
    // Same detached instant, same delivered prefix; the ONLY difference is the
    // tick below, which carries one agent to its sentinel and leaves the other
    // mid-flight.
    const producingSandbox = await seed({
      runId: producing,
      total: 6,
      lines: 2,
      detachedSince: now,
    })
    // The agent kept working after the viewer left and reached `{"__exit":0}`
    // with nobody reading its output — so four of its six lines were never
    // delivered and its transcript was never saved. This is the state only the
    // reaper resolves.
    await tick(finished, 4)
    const before = await state(producing)

    const body = await reap({ runIds: [finished, producing], now })

    // Both runs really were candidates, and both were probed: neither is past
    // the TTL, so the out-of-band exit probe is what separated them.
    expect(body.reap.considered).toBe(2)
    expect(body.reap.probed).toBe(2)
    expect(body.reap.outcomes.finalized).toBe(1)
    expect(body.reap.outcomes.producing).toBe(1)
    expect(body.reap.outcomes.expired).toBe(0)
    expect(reapEntry(body, finished).outcome).toBe('finalized')
    expect(reapEntry(body, finished).status).toBe('completed')
    expect(reapEntry(body, finished).exitCode).toBe(0)
    expect(reapEntry(body, producing).outcome).toBe('producing')

    // `withPersistence.onFinish` runs in the drive's teardown, which the sweep's
    // own response does not wait for, so this waits for the FACT rather than for a
    // duration. A run that never lands its transcript fails here with the whole
    // state dumped, which is the outcome under test.
    const after = await stateUntil(
      finished,
      'the finalized run to save its transcript',
      (record) =>
        record.messages.some((message) => message.role === 'assistant'),
    )
    expect(after.record?.status).toBe('completed')
    expect(typeof after.record?.finishedAt).toBe('number')
    expect(after.record?.error).toBeUndefined()
    // The four undelivered lines arrived and the two already-stored ones did NOT
    // arrive twice: alignment suppressed them. Asserted as the exact sequence,
    // because a duplicated delta is what a failed alignment produces and a
    // substring check cannot see it.
    expect(after.log.map((entry) => entry.type)).toEqual(FULL_SEQUENCE)
    expect(
      after.log
        .filter((entry) => entry.type === 'TEXT_MESSAGE_CONTENT')
        .map((entry) => entry.delta),
    ).toEqual(['1', '2', '3', '4', '5', '6'])

    // THE point of the `'finalized'` outcome. `withPersistence.onFinish` is what
    // saves a thread's history, and a run that completes while detached has
    // nobody to run it — so until something drives it to terminal the
    // conversation never lands at all. This is that transcript, and the
    // still-producing run's empty one (asserted below) is the control.
    //
    // It holds the REMAINDER, not the whole message: alignment suppresses the
    // delivered prefix inside the adapter, so `withPersistence`'s accumulator
    // never sees '1','2' — the delivery log is the complete record, the saved
    // message is not. That is a property of every takeover, not of the reaper,
    // and it is pinned here because it is invisible in the log assertion above.
    expect(
      after.messages.map((message) => `${message.role}:${message.text}`),
    ).toEqual(['user:go', 'assistant:123456'])

    // The journal sweep runs after the reaper, so the finalized run's journal is
    // deletable — the delivery log is the record now — while the live one's is
    // the only copy of the bytes a successor would replay and must survive.
    expect(pruneFor(body, finishedSandbox).deleted).toEqual([finished])
    expect(after.journalFile).toBe(false)
    expect(pruneFor(body, producingSandbox).deleted).toEqual([])
    expect(
      pruneFor(body, producingSandbox).kept.map((entry) => entry.reason),
    ).toEqual(['non-terminal'])
    expect(pruneFor(body, producingSandbox).ageGate).toBe('listed')

    const untouched = await state(producing)
    expectUntouched(before, untouched)
    expect(untouched.log.map((entry) => entry.type)).toEqual(DELIVERED_PREFIX)
  })

  test('expires a still-producing detached run past its TTL, and leaves a fresher one alone', async () => {
    const expired = uniqueRunId('reap-expired')
    const fresh = uniqueRunId('reap-fresh')
    const now = Date.now()

    // Identical runs — same total, same delivered prefix, same still-working
    // agent. The ONLY difference is when the viewer left.
    await seed({
      runId: expired,
      total: 6,
      lines: 2,
      detachedSince: now - 10 * 60 * 1000,
    })
    await seed({ runId: fresh, total: 6, lines: 2, detachedSince: now })
    const before = await state(fresh)

    // A still-producing agent cannot be stopped by the cancel the reaper records:
    // nothing in the library polls `RunRecord.cancelRequested` to abort a live
    // drive, so `runBudgetMs` is the only thing that ends this one. Kept short so
    // the sweep returns promptly; the value is a server-side bound, not a sleep in
    // the test.
    const body = await reap({
      runIds: [expired, fresh],
      now,
      runBudgetMs: 500,
    })

    expect(body.reap.considered).toBe(2)
    // Only the fresher run was probed. An expired run needs no probe — its
    // outcome is terminal whether or not the agent finished — so `probed: 1` is
    // itself the proof that the two were classified differently.
    expect(body.reap.probed).toBe(1)
    expect(reapEntry(body, fresh).outcome).toBe('producing')
    expect(reapEntry(body, expired).outcome).toBe(EXPIRED_LIVE_OUTCOME)
    // `terminalizedAnyway` is reported on `'budget-exceeded'` only — it exists so
    // an operator reading the anomaly does not have to infer that the record still
    // reached terminal. On the expiry path the outcome itself already says so.
    expect(reapEntry(body, expired).terminalizedAnyway).toBeUndefined()

    await expectExpiredAndTornDown(expired)
    expectUntouched(before, await state(fresh))
  })

  test('the TTL cutoff is inclusive: a run exactly at it expires, one millisecond inside it is untouched', async () => {
    const atCutoff = uniqueRunId('reap-at-cutoff')
    const insideCutoff = uniqueRunId('reap-inside-cutoff')
    const now = Date.now()

    // One millisecond apart, either side of `now - ttl`.
    // `RunStore.listReclaimable` documents that cutoff as INCLUSIVE and the
    // reaper classifies expiry against the same one; the two disagreeing by a
    // millisecond would list a run as reclaimable and then call it fresh on
    // every sweep, forever.
    await seed({
      runId: atCutoff,
      total: 6,
      lines: 2,
      detachedSince: now - DETACHED_RUN_TTL_MS,
    })
    await seed({
      runId: insideCutoff,
      total: 6,
      lines: 2,
      detachedSince: now - DETACHED_RUN_TTL_MS + 1,
    })
    const before = await state(insideCutoff)

    const body = await reap({
      runIds: [atCutoff, insideCutoff],
      now,
      runBudgetMs: 500,
    })

    expect(body.reap.considered).toBe(2)
    // The whole assertion, in one number: exactly one of the two was treated as
    // expired, and it was not the one a millisecond inside the window.
    expect(body.reap.probed).toBe(1)
    expect(reapEntry(body, insideCutoff).outcome).toBe('producing')
    expect(reapEntry(body, atCutoff).outcome).toBe(EXPIRED_LIVE_OUTCOME)

    await expectExpiredAndTornDown(atCutoff)
    expectUntouched(before, await state(insideCutoff))
  })
})

// ---------------------------------------------------------------------------
// 7. Replay divergence is loud
// ---------------------------------------------------------------------------

/**
 * Determinism is a PRECONDITION of the takeover, not a property of it: a resumed
 * journal read is idempotent only because `createRunScopedIdGen` makes
 * re-translation reproduce the same ids. `alignToStoredLog` verifies that on every
 * attach and throws `JournalReplayDivergedError` on the first mismatch, and the
 * alternative to throwing is a delivered stream whose prefix and suffix disagree
 * about message identity — a duplicated `TEXT_MESSAGE_START`, and a client that
 * renders two messages for one.
 *
 * `?nondeterministic=1` makes the attaching translator mint a message id that is
 * not run-scoped, leaving the stored prefix exactly as the previous host wrote it.
 * The control run below is the same seed WITHOUT the flag, so the two differ in
 * that one respect and nothing else.
 */
test.describe('durable runs — replay divergence', () => {
  test('a non-deterministic replay fails the attach loudly instead of duplicating the prefix', async () => {
    const diverged = uniqueRunId('diverge-replay')
    const aligned = uniqueRunId('aligned-replay')
    await seed({ runId: diverged, total: 2, lines: 2 })
    await seed({ runId: aligned, total: 2, lines: 2 })

    const bad = await SseStream.open(
      routeUrl({ runId: diverged, offset: '-1', nondeterministic: '1' }),
      { method: 'GET' },
    )
    const delivered = await bad.drain()

    // The stored prefix replays, and then the run ENDS in an error — it does not
    // continue with a second TEXT_MESSAGE_START under a new id, and it does not
    // re-deliver '1','2'.
    expect(delivered.map(eventType)).toEqual([...DELIVERED_PREFIX, 'RUN_ERROR'])
    expect(contentDeltas(delivered)).toEqual(['1', '2'])
    const failure = delivered.at(-1)
    expect(typeof failure?.data.message).toBe('string')
    expect(String(failure?.data.message)).toContain(
      'journal replay diverged at index 1',
    )

    const after = await stateUntil(
      diverged,
      'the diverged run to be recorded as failed',
      (record) => record.record?.status === 'failed',
    )
    expect(after.log.map((entry) => entry.type)).toEqual([
      ...DELIVERED_PREFIX,
      'RUN_ERROR',
    ])
    // No assistant turn was saved from a stream the guard refused to trust — the
    // stored prefix stays the only record of what was delivered.
    expect(
      after.messages.filter((message) => message.role === 'assistant'),
    ).toEqual([])

    // The control: the identical seed, attached WITHOUT the flag, aligns and
    // completes. Without this the test above also passes if an attach can never
    // succeed at all.
    const good = await SseStream.open(
      routeUrl({ runId: aligned, offset: '-1' }),
      { method: 'GET' },
    )
    expect((await good.drain()).map(eventType)).toEqual(TWO_LINE_SEQUENCE)
    const control = await stateUntil(
      aligned,
      'the aligned run to complete',
      (record) => record.record?.status === 'completed',
    )
    expect(control.log.map((entry) => entry.type)).toEqual(TWO_LINE_SEQUENCE)
    expect(control.log.filter((entry) => entry.type === 'RUN_ERROR')).toEqual(
      [],
    )
  })
})
