import { encodeWsFrame } from '@tanstack/ai'
import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'
import type { AttributeValue } from '@opentelemetry/api'
import type { OperationReport, SessionEvent } from '@tanstack/ai-harness'

type Scenario = 'wire' | 'gap' | 'tree' | 'lifecycle' | 'tracing'

/** One frame of an SSE stream, with the `id` of its SSE event. */
interface Read {
  id: string | null
  frame: {
    type: string
    v?: number
    cursor?: string
    threadId?: string
    operationId?: string
    event?: {
      type: string
      name?: string
      value?: unknown
      parentRunId?: string
    }
  }
}

interface RecordedSpan {
  name: string
  attributes: Record<string, AttributeValue>
  links: Array<{ context: unknown }> | null
  hasParent: boolean
  ended: boolean
}

interface Traces {
  spans: Array<RecordedSpan>
  reports: Array<OperationReport>
}

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const CALLER = `00-${TRACE_ID}-00f067aa0ba902b7-01`
/** The span context that `CALLER` names. */
const CALLER_CONTEXT = {
  traceId: TRACE_ID,
  spanId: '00f067aa0ba902b7',
  traceFlags: 1,
  isRemote: true,
}

const ROUTE = '/api/harness-observability'

/** Start a run of `scenario`. */
async function start(request: APIRequestContext, scenario: Scenario) {
  const res = await request.post(`${ROUTE}/start`, { data: { scenario } })
  expect(res.ok()).toBe(true)
  const started: { error?: string; runId: string; threadId: string } =
    await res.json()
  expect(started.error ?? null).toBeNull()
  return started
}

async function report<T>(request: APIRequestContext, runId: string) {
  const res = await request.get(`${ROUTE}/report?runId=${runId}`)
  const body: T & { error?: string } = await res.json()
  expect(body.error ?? null).toBeNull()
  return body
}

const stop = (request: APIRequestContext, runId: string) =>
  request.post(`${ROUTE}/stop?runId=${runId}`)

/**
 * Read `GET events` of the run until `isDone` is true for the frames so
 * far. `: ping` comments have no `data:` line, so they are skipped.
 */
async function readEvents(
  url: string,
  isDone: (frames: Array<Read>) => boolean,
  headers: Record<string, string> = {},
) {
  const response = await fetch(url, { headers })
  if (!response.body) throw new Error('The session stream has no body.')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  const frames: Array<Read> = []
  let buffer = ''
  while (!isDone(frames)) {
    const read = await reader.read()
    if (read.done) break
    buffer += read.value
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const lines = block.split('\n')
      const data = lines.find((line) => line.startsWith('data: '))
      if (!data) continue
      const id = lines.find((line) => line.startsWith('id: '))
      frames.push({
        id: id ? id.slice('id: '.length) : null,
        frame: JSON.parse(data.slice('data: '.length)),
      })
    }
  }
  await reader.cancel()
  return { response, frames }
}

const isFinished = ({ frame }: Read) =>
  frame.event?.type === 'CUSTOM' &&
  frame.event.name === 'harness.operation.finished'

/** The values of the `name` events in `frames`, in order. */
const valuesOf = (frames: Array<Read>, name: string) =>
  frames.flatMap(({ frame }) =>
    frame.event?.type === 'CUSTOM' && frame.event.name === name
      ? [frame.event.value]
      : [],
  )

test.describe('harness observability', () => {
  test('every frame of GET events is a wire chunk and starts with hello', async ({
    request,
    baseURL,
  }) => {
    const { runId, threadId } = await start(request, 'wire')
    try {
      const { response, frames } = await readEvents(
        `${baseURL}${ROUTE}/events?runId=${runId}&threadId=${threadId}&v=2&from=0`,
        (seen) => seen.some(isFinished),
        { 'X-Request-Id': 'obs-wire-1' },
      )
      expect(response.headers.get('X-Request-Id')).toBe('obs-wire-1')
      expect(frames[0]).toEqual({
        id: null,
        frame: { type: 'harness.hello', v: 2, threadId },
      })

      const events = frames.slice(1)
      const { logged } = await report<{ logged: Array<SessionEvent> }>(
        request,
        runId,
      )
      expect(events.map(({ frame }) => frame.type)).toEqual(
        logged.map(() => 'harness.event'),
      )
      // The SSE id and the frame cursor are the cursor of the logged event.
      expect(events.map(({ id, frame }) => [id, frame.cursor])).toEqual(
        logged.map((entry) => [entry.cursor, entry.cursor]),
      )
      events.forEach(({ frame }, index) => {
        const entry = logged[index]!
        expect(frame.threadId).toBe(threadId)
        expect(frame.operationId).toBe(entry.operationId)
        expect(frame.event).toEqual(
          JSON.parse(encodeWsFrame(entry.event, undefined)),
        )
      })
      // At least one logged chunk has keys that the wire drops, so an
      // internal chunk on the wire fails the check above.
      const isLossy = logged.some(
        (entry) =>
          encodeWsFrame(entry.event, undefined) !== JSON.stringify(entry.event),
      )
      expect(isLossy).toBe(true)
    } finally {
      await stop(request, runId)
    }
  })

  test('a cursor from before a truncation gets harness.gap', async ({
    request,
    baseURL,
  }) => {
    const { runId, threadId } = await start(request, 'gap')
    try {
      const { head } = await report<{ head: string }>(request, runId)
      const gap = {
        id: head,
        frame: {
          type: 'harness.event',
          cursor: head,
          threadId,
          operationId: 'session',
          event: {
            type: 'CUSTOM',
            name: 'harness.gap',
            value: { from: '0', resumeAt: head, reason: 'truncated' },
            timestamp: expect.any(Number),
          },
        },
      }
      const url = `${baseURL}${ROUTE}/events?runId=${runId}&threadId=${threadId}`
      const fromQuery = await readEvents(
        `${url}&from=0`,
        (seen) => seen.length >= 2,
      )
      expect(fromQuery.frames).toEqual([
        { id: null, frame: { type: 'harness.hello', v: 2, threadId } },
        gap,
      ])

      // A client that resumes with `Last-Event-ID` gets the same gap.
      const resumed = await readEvents(url, (seen) => seen.length >= 2, {
        'Last-Event-ID': '0',
      })
      expect(resumed.frames[1]).toEqual(gap)
    } finally {
      await stop(request, runId)
    }
  })

  test('a parallel group of agents gives the whole tree in one stream', async ({
    request,
    baseURL,
  }) => {
    const { runId, threadId } = await start(request, 'tree')
    try {
      const run = await report<{
        result: string
        leadRunId: string
        agentRuns: Array<{ runId: string; parentRunId: string | null }>
      }>(request, runId)
      expect(run.result).toBe('helped helped')
      // The lead, its helper and nester, and the helper of the nester.
      const expected = Object.fromEntries(
        run.agentRuns.map((item) => [item.runId, item.parentRunId]),
      )
      expect(Object.keys(expected)).toHaveLength(4)
      expect(expected[run.leadRunId]).toBeNull()
      const children = run.agentRuns.filter(
        (item) => item.parentRunId === run.leadRunId,
      )
      expect(children).toHaveLength(2)
      const grandchildren = run.agentRuns.filter((item) =>
        children.some((child) => child.runId === item.parentRunId),
      )
      expect(grandchildren).toHaveLength(1)

      const { frames } = await readEvents(
        `${baseURL}${ROUTE}/events?runId=${runId}&threadId=${threadId}&from=0`,
        (seen) =>
          seen.some(
            (read) =>
              read.frame.operationId === run.leadRunId && isFinished(read),
          ),
      )

      // The tree from the frames alone: the `parentRunId` of the AG-UI
      // RUN_STARTED of each operation.
      const tree = new Map<string, string | null>()
      for (const { frame } of frames.slice(1)) {
        expect(frame.threadId).toBe(threadId)
        if (frame.event?.type !== 'RUN_STARTED') continue
        tree.set(frame.operationId ?? '', frame.event.parentRunId ?? null)
      }
      // The session has operations of its own, for example its inputs.
      const agentTree = Object.fromEntries(
        [...tree].filter(([operationId]) => operationId in expected),
      )
      expect(agentTree).toEqual(expected)
    } finally {
      await stop(request, runId)
    }
  })

  test('a new thread gets harness.ownership.changed, and a send during a turn gets harness.input.queued', async ({
    request,
    baseURL,
  }) => {
    const { runId, threadId } = await start(request, 'lifecycle')
    try {
      // The first turn runs and waits for the model.
      const receipt = await request.post(`${ROUTE}/control?runId=${runId}`, {
        data: {
          threadId,
          input: {
            op: 'prompt',
            message: '[harness-observability] two',
            inputId: 'in-2',
          },
        },
      })
      expect(await receipt.json()).toMatchObject({
        status: 'queued',
        inputId: 'in-2',
      })
      await request.post(`${ROUTE}/release?runId=${runId}`)

      const { frames } = await readEvents(
        `${baseURL}${ROUTE}/events?runId=${runId}&threadId=${threadId}&from=0`,
        (seen) => seen.filter(isFinished).length >= 2,
      )
      expect(valuesOf(frames, 'harness.ownership.changed')).toEqual([
        { epoch: 1, reason: 'acquired' },
      ])
      expect(valuesOf(frames, 'harness.input.queued')).toEqual([
        { inputId: 'in-2', delivery: 'queue' },
      ])
      // The host owns the log before the first turn starts.
      const names = frames.map(({ frame }) => frame.event?.name)
      expect(names.indexOf('harness.ownership.changed')).toBeLessThan(
        names.indexOf('harness.operation.started'),
      )
    } finally {
      await stop(request, runId)
    }
  })

  test('a traceparent on POST control links the span of the run on the host that runs it', async ({
    request,
  }) => {
    const { runId, threadId } = await start(request, 'tracing')
    try {
      // The other host stores the input in the log. The owner runs it after
      // its turn.
      const receipt = await request.post(`${ROUTE}/control?runId=${runId}`, {
        headers: { traceparent: CALLER },
        data: {
          threadId,
          input: { op: 'followUp', message: '[harness-observability] then' },
        },
      })
      expect(await receipt.json()).toMatchObject({ status: 'queued' })
      await request.post(`${ROUTE}/release?runId=${runId}`)

      type Traced = {
        owner: Traces
        other: Traces
        ownerCalls: number
        otherCalls: number
      }
      let traced: Traced | undefined
      const operations = (traces: Traces) =>
        traces.spans.filter((span) => span.name === 'harness.operation')
      await expect
        .poll(
          async () => {
            traced = await report<Traced>(request, runId)
            const ended = operations(traced.owner).filter((span) => span.ended)
            return [ended.length, traced.owner.reports.length]
          },
          { timeout: 20_000 },
        )
        .toEqual([2, 4])
      const { owner, other, ownerCalls, otherCalls } = traced!

      const spans = operations(owner)
      for (const span of spans) {
        expect(span.attributes).toMatchObject({
          'harness.thread_id': threadId,
          'harness.operation.kind': 'chat',
          'harness.operation.status': 'completed',
        })
        // A link, not a parent: the caller is on another machine.
        expect(span.hasParent).toBe(false)
      }
      const linked = spans.filter((span) => span.links !== null)
      expect(linked).toHaveLength(1)
      expect(linked[0]?.links).toEqual([{ context: CALLER_CONTEXT }])

      // `onOperation` reports each run once when it starts and once when it
      // settles.
      for (const span of spans) {
        const runOf = owner.reports.filter(
          (item) => item.operation.id === span.attributes['harness.run_id'],
        )
        expect(runOf.map((item) => item.phase)).toEqual(['started', 'settled'])
        expect(runOf[1]?.operation).toMatchObject({
          threadId,
          kind: 'chat',
          status: 'completed',
        })
      }
      // The host that only stored the input runs nothing, so it reports
      // nothing.
      expect(other).toEqual({ spans: [], reports: [] })
      expect(ownerCalls).toBe(2)
      expect(otherCalls).toBe(0)
    } finally {
      await stop(request, runId)
    }
  })
})
