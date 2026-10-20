import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType, defineAgent } from '@tanstack/ai'
import {
  memoryLogState,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { createHarnessClient } from '../src/client'
import { noopTracer } from '../src/observability'
import { createHarnessHandler } from '../src/server'
import { trace } from '@opentelemetry/api'
import { after, fakeSpan, gate, mockAdapter, text } from './helpers'
import type {
  AttributeValue,
  Span,
  SpanContext,
  SpanOptions,
  Tracer,
} from '@opentelemetry/api'
import type { StreamChunk } from '@tanstack/ai'
import type { LogStore } from '@tanstack/ai-persistence'
import type { AnyHarness, HarnessHostOptions, OperationReport } from '../src'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const THREAD = 't1'
const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const CALLER = `00-${TRACE_ID}-00f067aa0ba902b7-01`
/** The span context that `CALLER` names. */
const CALLER_CONTEXT: SpanContext = {
  traceId: TRACE_ID,
  spanId: '00f067aa0ba902b7',
  traceFlags: 1,
  isRemote: true,
}

/** A span that the fake tracer started. */
interface RecordedSpan {
  name: string
  options: SpanOptions
  attributes: Record<string, AttributeValue | undefined>
  /** The span of the context that `startSpan` got. */
  parent: RecordedSpan | undefined
  status?: { code: number; message?: string }
  ended: boolean
  span: Span
}

/** A tracer that records every span, and reads the parent from the context. */
function fakeTracer() {
  const spans: Array<RecordedSpan> = []
  const tracer: Tracer = {
    startSpan: (name, options = {}, context) => {
      const parentSpan = context && trace.getSpan(context)
      const span = fakeSpan(
        {
          traceId: 'a'.repeat(32),
          spanId: (spans.length + 1).toString(16).padStart(16, '0'),
          traceFlags: 1,
        },
        {
          setAttribute: (key, value) => {
            recorded.attributes[key] = value
          },
          setStatus: (status) => {
            recorded.status = status
          },
          end: () => {
            recorded.ended = true
          },
        },
      )
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
  const operations = () =>
    spans.filter((item) => item.name === 'harness.operation')
  return { tracer, spans, operations }
}

/** `content` as one model call that reports 7 prompt and 3 completion tokens. */
const answerWithUsage =
  (content: string): Reply =>
  () =>
    text(content).map(
      (chunk): StreamChunk =>
        chunk.type === EventType.RUN_FINISHED
          ? {
              ...chunk,
              usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10 },
            }
          : chunk,
    )

const helper = defineAgent({
  name: 'helper',
  description: 'Helps',
  run: async () => 'helped',
})

/** Starts a helper of its own, so the tree has three levels. */
const nester = defineAgent({
  name: 'nester',
  description: 'Starts a helper',
  run: async (ctx) => await ctx.harness!.agents.run('helper'),
})

/** Runs a helper and a nester in a parallel group. */
const lead = defineAgent({
  name: 'lead',
  description: 'Runs a group',
  run: async (ctx) => {
    const results = await ctx.harness!.agents.group({}, (g) => [
      g.start('helper'),
      g.start('nester'),
    ])
    return results.join(' ')
  },
})

const agentHarness = defineHarness({
  name: 'test/tracing-agents',
  adapter: mockAdapter([]).adapter,
  agents: [lead, nester, helper],
  subagents: { agents: [], limits: { maxDepth: 3 } },
})

const chatHarness = (replies: Array<Reply>) =>
  defineHarness({ name: 'test/tracing', adapter: mockAdapter(replies).adapter })

/** A host on `log` with the session of `THREAD` open. */
async function hostOn(
  log: LogStore,
  harness: AnyHarness,
  options: Omit<HarnessHostOptions, 'persistence'> = {},
) {
  const host = createHarnessHost({
    persistence: { stores: { log } },
    ...options,
  })
  const session = await host.open(harness, { threadId: THREAD })
  return { host, session }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('operation spans', () => {
  it('writes a span for each run, and a child run on the same host is a child span', async () => {
    const { tracer, operations } = fakeTracer()
    const reports: Array<OperationReport> = []
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      observability: {
        tracer,
        onOperation: (report) => void reports.push(report),
      },
    })
    const session = await host.open(agentHarness, { threadId: THREAD })

    const run = session.agents.lead.start()
    await expect(run).resolves.toBe('helped helped')

    // The lead, its helper and nester, and the helper of the nester.
    await waitFor(() => expect(operations()).toHaveLength(4))
    const tree = new Map(
      session.agentRuns().map((item) => [item.runId, item.parentRunId]),
    )
    for (const span of operations()) {
      const runId = span.attributes['harness.run_id']
      expect(typeof runId).toBe('string')
      expect(span.attributes).toMatchObject({
        'harness.thread_id': THREAD,
        'harness.operation.kind': 'agent',
        'harness.operation.status': 'completed',
      })
      expect(span.ended).toBe(true)
      const parentRunId = tree.get(String(runId))
      expect(span.attributes['harness.parent_run_id']).toBe(parentRunId)
      expect(span.parent?.attributes['harness.run_id']).toBe(parentRunId)
    }
    const root = operations().find((span) => span.parent === undefined)
    expect(root?.attributes).toMatchObject({
      'harness.run_id': run.id,
      'harness.agent': 'lead',
    })

    // One started and one settled report for each run.
    await waitFor(() => expect(reports).toHaveLength(8))
    for (const runId of tree.keys()) {
      const phases = reports
        .filter((report) => report.operation.id === runId)
        .map((report) => report.phase)
      expect(phases).toEqual(['started', 'settled'])
    }
    await host.close()
  })

  it('links the traceparent of POST run, and does not take it as the parent', async () => {
    const { tracer, operations } = fakeTracer()
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      observability: { tracer },
    })
    const harness = chatHarness([() => text('Hello.')])
    const handler = createHarnessHandler({ host, harness, openAccess: true })

    const response = await handler(
      new Request('http://x/api/harness/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json', traceparent: CALLER },
        body: JSON.stringify({
          threadId: THREAD,
          runId: 'run-a',
          messages: [{ id: 'm-1', role: 'user', content: 'Hi.' }],
          tools: [],
          context: [],
        }),
      }),
    )
    expect(await response.text()).toContain('Hello.')

    await waitFor(() => expect(operations()[0]?.ended).toBe(true))
    const [span] = operations()
    expect(span?.options.links).toEqual([{ context: CALLER_CONTEXT }])
    expect(span?.parent).toBeUndefined()
    expect(span?.attributes).toMatchObject({
      'harness.run_id': 'run-a',
      'harness.operation.kind': 'chat',
    })
    await host.close()
  })

  it('links a traceparent sent to one host on the span of the host that runs the turn', async () => {
    const logState = memoryLogState()
    const ownerTracing = fakeTracer()
    const otherTracing = fakeTracer()
    const otherReports: Array<OperationReport> = []
    const release = gate()
    const owner = await hostOn(
      memoryLogStore({ state: logState }),
      chatHarness([after(release.opened, 'One.'), () => text('Two.')]),
      { observability: { tracer: ownerTracing.tracer } },
    )
    const harness = chatHarness([() => text('Not here.')])
    const other = await hostOn(memoryLogStore({ state: logState }), harness, {
      observability: {
        tracer: otherTracing.tracer,
        onOperation: (report) => void otherReports.push(report),
      },
    })
    const handler = createHarnessHandler({
      host: other.host,
      harness,
      openAccess: true,
    })
    const sentHeaders: Array<string | null> = []
    const client = createHarnessClient<typeof harness>({
      url: 'http://x/api/harness/',
      threadId: THREAD,
      fetch: (input, init) => {
        const request = new Request(input, init)
        sentHeaders.push(request.headers.get('traceparent'))
        return handler(request)
      },
    })

    await owner.session.send('Go.').receipt
    const receipt = await client.send('And then?', {
      mode: 'followUp',
      traceparent: CALLER,
    })
    expect(receipt.status).toBe('queued')
    expect(sentHeaders).toEqual([CALLER])
    release.open()
    expect(
      (await other.session.settled({ inputId: receipt.inputId })).outcome,
    ).toBe('completed')

    await waitFor(() =>
      expect(ownerTracing.operations().filter((s) => s.ended)).toHaveLength(2),
    )
    const linked = ownerTracing
      .operations()
      .filter((span) => span.options.links !== undefined)
    expect(linked).toHaveLength(1)
    expect(linked[0]?.options.links).toEqual([{ context: CALLER_CONTEXT }])
    expect(linked[0]?.parent).toBeUndefined()
    // The host that only offered the input runs nothing, so it reports nothing.
    expect(otherTracing.operations()).toEqual([])
    expect(otherReports).toEqual([])
    await owner.host.close()
    await other.host.close()
  })

  it('writes a harness.transfer span', async () => {
    const { tracer, spans } = fakeTracer()
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      observability: { tracer },
    })
    const harness = chatHarness([() => text('Hello.')])
    const session = await host.open(harness, { threadId: THREAD })
    await session.send('Hi.')

    const { transferId, threadId } = await host.transfer({
      from: { harness, threadId: THREAD },
      to: { harness },
      envelope: { note: 'Moved.' },
    })

    const transfer = spans.find((span) => span.name === 'harness.transfer')
    expect(transfer?.attributes).toMatchObject({
      'harness.thread_id': THREAD,
      'harness.transfer.id': transferId,
      'harness.transfer.to_thread_id': threadId,
    })
    expect(transfer?.ended).toBe(true)
    await host.close()
  })
})

describe('onOperation', () => {
  it('reports a turn once when it starts and once when it settles, with its usage', async () => {
    const reports: Array<OperationReport> = []
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      observability: { onOperation: (report) => void reports.push(report) },
    })
    const session = await host.open(chatHarness([answerWithUsage('Hello.')]), {
      threadId: THREAD,
    })

    const turn = session.send('Hi.')
    await turn

    await waitFor(() => expect(reports).toHaveLength(2))
    expect(reports[0]).toEqual({
      phase: 'started',
      operation: {
        id: turn.id,
        kind: 'chat',
        threadId: THREAD,
        status: 'running',
      },
    })
    expect(reports[1]).toMatchObject({
      phase: 'settled',
      operation: {
        id: turn.id,
        kind: 'chat',
        threadId: THREAD,
        status: 'completed',
        usage: { calls: 1, promptTokens: 7, totalTokens: 10 },
      },
    })
    expect(reports[1]?.operation.durationMs).toBeGreaterThanOrEqual(0)
    await host.close()
  })

  it('reports the error of a failed turn, and a listener that throws changes nothing', async () => {
    const reports: Array<OperationReport> = []
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      observability: {
        onOperation: (report) => {
          reports.push(report)
          throw new Error('listener broke')
        },
      },
    })
    const session = await host.open(
      chatHarness([
        () => {
          throw new Error('model down')
        },
      ]),
      { threadId: THREAD },
    )

    const turn = session.send('Hi.')
    await expect(Promise.resolve(turn)).rejects.toThrow('model down')

    await waitFor(() => expect(reports).toHaveLength(2))
    expect(reports[1]?.operation).toMatchObject({
      status: 'failed',
      error: { message: 'model down' },
    })
    await host.close()
  })

  it('a tracer that throws fails no turn and stops no report', async () => {
    let calls = 0
    const reports: Array<OperationReport> = []
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      observability: {
        tracer: {
          // The first span does not start. The second one does not end.
          startSpan: () => {
            calls += 1
            if (calls === 1) throw new Error('startSpan broke')
            return fakeSpan(CALLER_CONTEXT, {
              end: () => {
                throw new Error('end broke')
              },
            })
          },
          startActiveSpan: () => {
            throw new Error('The harness does not call startActiveSpan.')
          },
        },
        onOperation: (report) => void reports.push(report),
      },
    })
    const session = await host.open(
      chatHarness([() => text('One.'), () => text('Two.')]),
      { threadId: THREAD },
    )

    await session.send('Hi.')
    await session.send('Again.')

    await waitFor(() => expect(reports).toHaveLength(4))
    expect(reports.map((report) => report.phase)).toEqual([
      'started',
      'settled',
      'started',
      'settled',
    ])
    await host.close()
  })
})

describe('without observability', () => {
  it('starts no span', async () => {
    const startSpan = vi.spyOn(noopTracer, 'startSpan')
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(chatHarness([() => text('Hello.')]), {
      threadId: THREAD,
    })

    await session.send('Hi.')

    expect(startSpan).not.toHaveBeenCalled()
    await host.close()
  })

  it('uses one shared span when only onOperation is set', async () => {
    const startSpan = vi.spyOn(noopTracer, 'startSpan')
    const reports: Array<OperationReport> = []
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      observability: { onOperation: (report) => void reports.push(report) },
    })
    const session = await host.open(
      chatHarness([() => text('One.'), () => text('Two.')]),
      { threadId: THREAD },
    )

    await session.send('Hi.')
    await session.send('Again.')

    await waitFor(() => expect(reports).toHaveLength(4))
    const returned = startSpan.mock.results.map((result) => result.value)
    expect(returned).toHaveLength(2)
    expect(returned[0]).toBe(returned[1])
    await host.close()
  })
})
