import { createFileRoute } from '@tanstack/react-router'
import { EventType, defineAgent } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createHarnessHost, defineHarness, logIdOf } from '@tanstack/ai-harness'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import {
  memoryLogState,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import { trace } from '@opentelemetry/api'
import type {
  AttributeValue,
  Span,
  SpanContext,
  SpanOptions,
  Tracer,
} from '@opentelemetry/api'
import type {
  HarnessHost,
  HarnessHostOptions,
  OperationReport,
  SessionEvent,
} from '@tanstack/ai-harness'

/**
 * What a client sees of a run: the session stream on the wire, the gap
 * after a truncation, the run tree, the lifecycle events, and the traces.
 *
 * - `POST .../start` with `{ scenario }` makes the hosts of one run, and
 *   returns the run id and the thread id.
 *   - `wire`: one host on a log runs one turn.
 *   - `gap`: a first host runs one turn with a snapshot after each record
 *     and `keepLogRecords: 'since-snapshot'`, so the log keeps only the records
 *     after the snapshot. Then it stops, and a second host serves the
 *     thread.
 *   - `tree`: the `lead` agent runs `helper` and `nester` in a parallel
 *     group. `nester` runs a `helper` of its own.
 *   - `lifecycle`: one host on a log starts a turn whose model waits for
 *     `release`.
 *   - `tracing`: two hosts on one log backend, each with a fake tracer and
 *     an `onOperation` listener. The owner starts a turn whose model waits
 *     for `release`. The handler is the handler of the other host.
 * - `GET .../events?runId=&threadId=` and `POST .../control?runId=` go to
 *   the harness handler of the run.
 * - `POST .../release?runId=` lets the waiting model answer.
 * - `GET .../report?runId=` returns what the test checks.
 * - `POST .../stop?runId=` closes the hosts.
 *
 * A custom `fetch` answers with canned Anthropic streams, so no aimock
 * fixture is needed.
 */

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'
const MODEL = 'claude-sonnet-5-5'
const NAME = 'e2e/harness-observability'

const reply = (id: string, text: string) =>
  [
    {
      type: 'message_start',
      message: {
        id,
        type: 'message',
        role: 'assistant',
        content: [],
        model: MODEL,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 5, output_tokens: 0 },
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 1 },
    },
    { type: 'message_stop' },
  ]
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('')

/**
 * A model whose answers are `texts`, in order. The first answer waits for
 * `until`. `calls` counts the requests that reach it.
 */
function scriptedModel(
  texts: Array<string>,
  until: Promise<void> = Promise.resolve(),
) {
  const counter = { calls: 0 }
  const scriptedFetch: typeof fetch = async () => {
    counter.calls += 1
    if (counter.calls === 1) await until
    const text = texts[counter.calls - 1] ?? 'No more answers.'
    return new Response(reply(`msg_observability_${counter.calls}`, text), {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  const adapter = createAnthropicChat(MODEL, DUMMY_KEY, {
    fetch: scriptedFetch,
  })
  return { adapter, counter }
}

/** A promise that `open()` resolves. */
function gate() {
  let open = () => {}
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { open, opened }
}

/** Wait until `check()` is true, for at most 10 s. */
async function waitUntil(check: () => boolean) {
  const deadline = Date.now() + 10_000
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Waited 10 s for nothing.')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const isFinished = ({ event }: SessionEvent) =>
  event.type === EventType.CUSTOM && event.name === 'harness.operation.finished'

/** The logged events of `events`, until the first operation ends. */
async function loggedTurn(events: AsyncIterable<SessionEvent>) {
  const entries: Array<SessionEvent> = []
  for await (const entry of events) {
    entries.push(entry)
    if (isFinished(entry)) break
  }
  return entries
}

/** A span that the fake tracer started. */
interface RecordedSpan {
  name: string
  options: SpanOptions
  attributes: Record<string, AttributeValue | undefined>
  /** The span of the context that `startSpan` got. */
  parent: RecordedSpan | undefined
  ended: boolean
  span: Span
}

/**
 * A tracer that records every span, and reads the parent from the context,
 * as the fake tracer of `tracing.test.ts` does. `reports` keeps what
 * `onOperation` gets.
 */
function fakeObservability() {
  const spans: Array<RecordedSpan> = []
  const reports: Array<OperationReport> = []
  const tracer: Tracer = {
    startSpan: (name, options = {}, context) => {
      const parentSpan = context && trace.getSpan(context)
      const spanContext: SpanContext = {
        traceId: 'a'.repeat(32),
        spanId: (spans.length + 1).toString(16).padStart(16, '0'),
        traceFlags: 1,
      }
      const span: Span = {
        spanContext: () => spanContext,
        setAttribute: (key, value) => {
          recorded.attributes[key] = value
          return span
        },
        setAttributes: () => span,
        addEvent: () => span,
        addLink: () => span,
        addLinks: () => span,
        setStatus: () => span,
        updateName: () => span,
        end: () => {
          recorded.ended = true
        },
        isRecording: () => true,
        recordException: () => {},
      }
      const recorded: RecordedSpan = {
        name,
        options,
        attributes: { ...options.attributes },
        parent: spans.find((item) => item.span === parentSpan),
        ended: false,
        span,
      }
      spans.push(recorded)
      return span
    },
    startActiveSpan: () => {
      throw new Error('The harness does not call startActiveSpan.')
    },
  }
  return {
    observability: {
      tracer,
      onOperation: (report: OperationReport) => void reports.push(report),
    },
    /** The spans and the reports, as JSON. */
    read: () => ({
      spans: spans.map((item) => ({
        name: item.name,
        attributes: item.attributes,
        links: item.options.links ?? null,
        hasParent: item.parent !== undefined,
        ended: item.ended,
      })),
      reports,
    }),
  }
}

/** What a scenario makes. */
interface Setup {
  handler: (request: Request) => Promise<Response>
  report: () => Promise<unknown>
  hosts: Array<HarnessHost>
}

async function wire(threadId: string): Promise<Setup> {
  const { adapter } = scriptedModel(['Hello on the wire.'])
  const harness = defineHarness({ name: NAME, adapter })
  const host = createHarnessHost({
    persistence: { stores: { log: memoryLogStore() } },
  })
  const session = await host.open(harness, { threadId })
  await session.send('[harness-observability] wire')
  return {
    handler: createHarnessHandler({ host, harness, openAccess: true }),
    report: async () => ({ logged: await loggedTurn(session.events()) }),
    hosts: [host],
  }
}

async function gap(threadId: string): Promise<Setup> {
  const harness = defineHarness({
    name: NAME,
    adapter: scriptedModel(['Hello before the cut.']).adapter,
  })
  const persistence = memoryPersistence()
  const options: HarnessHostOptions = {
    persistence,
    log: { saveSnapshotAfter: { bytes: 1 } },
    lifecycle: { retention: { keepLogRecords: 'since-snapshot' } },
  }
  const first = createHarnessHost(options)
  const session = await first.open(harness, { threadId })
  await session.send('[harness-observability] gap')
  await session.close()
  await first.close()
  const snapshot = await persistence.stores.log.getSnapshot({
    logId: logIdOf({ logId: threadId }),
  })
  if (!snapshot) throw new Error('The first host wrote no snapshot.')
  const host = createHarnessHost(options)
  return {
    handler: createHarnessHandler({ host, harness, openAccess: true }),
    report: async () => ({ head: String(snapshot.seq) }),
    hosts: [host],
  }
}

const helper = defineAgent({
  name: 'helper',
  description: 'Helps',
  run: async () => 'helped',
})

/** Starts a helper of its own, so the tree has three levels. */
const nester = defineAgent({
  name: 'nester',
  description: 'Starts a helper',
  run: async (ctx) => {
    if (!ctx.harness) throw new Error('This agent must run in a harness.')
    return await ctx.harness.agents.run('helper')
  },
})

/** Runs a helper and a nester in a parallel group. */
const lead = defineAgent({
  name: 'lead',
  description: 'Runs a group',
  run: async (ctx) => {
    if (!ctx.harness) throw new Error('This agent must run in a harness.')
    const results = await ctx.harness.agents.group({}, (g) => [
      g.start('helper'),
      g.start('nester'),
    ])
    return results.join(' ')
  },
})

async function tree(threadId: string): Promise<Setup> {
  const harness = defineHarness({
    name: NAME,
    // The agents make no model call.
    adapter: scriptedModel([]).adapter,
    agents: [lead, nester, helper],
    // The helper of the nester is two levels below the lead.
    subagents: { agents: [], limits: { maxDepth: 3 } },
  })
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(harness, { threadId })
  const run = session.agents.lead.start()
  const result = await run
  return {
    handler: createHarnessHandler({ host, harness, openAccess: true }),
    report: async () => ({
      result,
      leadRunId: run.id,
      agentRuns: session.agentRuns().map((item) => ({
        runId: item.runId,
        parentRunId: item.parentRunId ?? null,
      })),
    }),
    hosts: [host],
  }
}

async function lifecycle(
  threadId: string,
  released: Promise<void>,
): Promise<Setup> {
  const { adapter } = scriptedModel(['One.', 'Two.'], released)
  const harness = defineHarness({ name: NAME, adapter })
  const host = createHarnessHost({
    persistence: { stores: { log: memoryLogStore() } },
  })
  const session = await host.open(harness, { threadId })
  const turn = session.send('[harness-observability] one', { inputId: 'in-1' })
  Promise.resolve(turn).catch(() => {})
  await waitUntil(() => session.snapshot().status === 'running')
  return {
    handler: createHarnessHandler({ host, harness, openAccess: true }),
    report: async () => ({ status: session.snapshot().status }),
    hosts: [host],
  }
}

async function tracing(
  threadId: string,
  released: Promise<void>,
): Promise<Setup> {
  const logState = memoryLogState()
  const ownerTracing = fakeObservability()
  const otherTracing = fakeObservability()
  const ownerModel = scriptedModel(['One.', 'Two.'], released)
  const otherModel = scriptedModel(['Not on this host.'])
  const ownerHost = createHarnessHost({
    persistence: { stores: { log: memoryLogStore({ state: logState }) } },
    observability: ownerTracing.observability,
  })
  const otherHost = createHarnessHost({
    persistence: { stores: { log: memoryLogStore({ state: logState }) } },
    observability: otherTracing.observability,
  })
  const owner = await ownerHost.open(
    defineHarness({ name: NAME, adapter: ownerModel.adapter }),
    { threadId },
  )
  const otherHarness = defineHarness({
    name: NAME,
    adapter: otherModel.adapter,
  })
  await otherHost.open(otherHarness, { threadId })
  const turn = owner.send('[harness-observability] go')
  Promise.resolve(turn).catch(() => {})
  await turn.receipt
  return {
    handler: createHarnessHandler({
      host: otherHost,
      harness: otherHarness,
      openAccess: true,
    }),
    report: async () => ({
      owner: ownerTracing.read(),
      other: otherTracing.read(),
      ownerCalls: ownerModel.counter.calls,
      otherCalls: otherModel.counter.calls,
    }),
    hosts: [ownerHost, otherHost],
  }
}

const scenarios = {
  wire: (threadId: string) => wire(threadId),
  gap: (threadId: string) => gap(threadId),
  tree: (threadId: string) => tree(threadId),
  lifecycle,
  tracing,
}

type Scenario = keyof typeof scenarios

interface Run extends Setup {
  release: () => void
  stop: () => Promise<void>
}

// ponytail: the runs that did not stop yet, kept in memory by run id.
const runs = new Map<string, Run>()
/** A run that nobody stops ends after this time. */
const RUN_TTL_MS = 60_000

const errorOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

async function start(request: Request) {
  const { scenario }: { scenario: Scenario } = await request.json()
  if (!(scenario in scenarios)) {
    return Response.json({ error: `No scenario ${scenario}.` })
  }
  const runId = crypto.randomUUID()
  const threadId = `e2e-harness-observability-${scenario}-${runId}`
  const release = gate()
  try {
    const setup = await scenarios[scenario](threadId, release.opened)
    const stop = async () => {
      if (!runs.delete(runId)) return
      release.open()
      for (const host of setup.hosts) await host.close()
    }
    runs.set(runId, { ...setup, release: release.open, stop })
    setTimeout(() => void stop(), RUN_TTL_MS)
    return Response.json({ runId, threadId })
  } catch (error) {
    return Response.json({ error: errorOf(error) })
  }
}

export const Route = createFileRoute('/api/harness-observability/$')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const route = url.pathname.split('/').at(-1)
        if (route === 'start') return start(request)
        const run = runs.get(url.searchParams.get('runId') ?? '')
        if (!run) return Response.json({ error: 'No such run.' })
        if (route === 'control') return run.handler(request)
        if (route === 'release') {
          run.release()
          return Response.json({ released: true })
        }
        if (route === 'stop') {
          await run.stop()
          return Response.json({ stopped: true })
        }
        return Response.json({ error: `No route ${route}.` }, { status: 404 })
      },
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const route = url.pathname.split('/').at(-1)
        const run = runs.get(url.searchParams.get('runId') ?? '')
        if (!run) return Response.json({ error: 'No such run.' })
        if (route !== 'report') return run.handler(request)
        try {
          return Response.json(await run.report())
        } catch (error) {
          return Response.json({ error: errorOf(error) })
        }
      },
    },
  },
})
