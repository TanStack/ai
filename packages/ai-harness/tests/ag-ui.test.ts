import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { HttpAgent } from '@ag-ui/client'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import {
  TANSTACK_SPEND_EVENT,
  createAgUiHandler,
  normalizeUsage,
  sessionEventsToAgUi,
} from '../src/ag-ui'
import { mockAdapter, text, toolCall } from './helpers'
import type { SessionEvent } from '../src'
import type { StreamChunk } from '@tanstack/ai'

/** Wrap raw AG-UI chunks in `SessionEvent`s, as `session.events()` would. */
async function* feed(
  chunks: Array<StreamChunk>,
  operationId = 'op-1',
): AsyncGenerator<SessionEvent> {
  let n = 0
  for (const event of chunks) {
    yield { cursor: String(++n), operationId, event }
  }
}

async function collect<T>(it: AsyncIterable<T>): Promise<Array<T>> {
  const out: Array<T> = []
  for await (const value of it) out.push(value)
  return out
}

const runFinished = (extra: Record<string, unknown>): StreamChunk =>
  ({
    type: EventType.RUN_FINISHED,
    runId: 'r',
    threadId: 't',
    timestamp: 0,
    ...extra,
  }) as unknown as StreamChunk

const custom = (name: string, value: unknown = {}): StreamChunk =>
  ({ type: EventType.CUSTOM, name, value, timestamp: 0 }) as unknown as StreamChunk

const typesOf = (events: Array<StreamChunk>) => events.map((e) => e.type)

describe('normalizeUsage', () => {
  it('sums the AG-UI spec array shape', () => {
    expect(
      normalizeUsage([
        { inputTokens: 10, outputTokens: 5 },
        { inputTokens: 1, outputTokens: 2 },
      ]),
    ).toEqual({ inputTokens: 11, outputTokens: 7, totalTokens: 18 })
  })

  it('maps the TanStack prompt/completion shape', () => {
    expect(
      normalizeUsage({ promptTokens: 8, completionTokens: 2, totalTokens: 10 }),
    ).toEqual({ inputTokens: 8, outputTokens: 2, totalTokens: 10 })
  })

  it('returns undefined for empty or missing usage', () => {
    expect(normalizeUsage(undefined)).toBeUndefined()
    expect(normalizeUsage(null)).toBeUndefined()
    expect(normalizeUsage([])).toBeUndefined()
  })
})

describe('sessionEventsToAgUi mapper', () => {
  it('passes native AG-UI events through, in order', async () => {
    const out = await collect(sessionEventsToAgUi(feed(text('hi'))))
    expect(typesOf(out)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ])
  })

  it('surfaces run usage under metadata.tanstack.usage', async () => {
    const [event] = await collect(
      sessionEventsToAgUi(
        feed([runFinished({ usage: [{ inputTokens: 10, outputTokens: 5 }] })]),
      ),
    )
    expect((event as any).metadata.tanstack.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    })
  })

  it('does not overwrite an existing metadata.tanstack.usage', async () => {
    const preset = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    const [event] = await collect(
      sessionEventsToAgUi(
        feed([
          runFinished({
            usage: [{ inputTokens: 99, outputTokens: 99 }],
            metadata: { tanstack: { usage: preset } },
          }),
        ]),
      ),
    )
    expect((event as any).metadata.tanstack.usage).toEqual(preset)
  })

  it('keeps interrupt outcomes intact for the AG-UI resume flow', async () => {
    const [event] = await collect(
      sessionEventsToAgUi(
        feed([
          runFinished({
            outcome: {
              type: 'interrupt',
              interrupts: [
                { id: 'i1', reason: 'tool_call', toolCallId: 'call_1' },
              ],
            },
          }),
        ]),
      ),
    )
    expect((event as any).outcome.type).toBe('interrupt')
    expect((event as any).outcome.interrupts[0].id).toBe('i1')
  })

  it('preserves subagent attribution on tool calls', async () => {
    const toolStart = {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'c1',
      toolCallName: 'lookup',
      subagentRunId: 'sub-1',
      timestamp: 0,
    } as unknown as StreamChunk
    const [event] = await collect(sessionEventsToAgUi(feed([toolStart])))
    expect((event as any).subagentRunId).toBe('sub-1')
  })

  it('keeps harness CUSTOM events by default and drops them on request', async () => {
    const chunks = [
      custom('harness.operation.started'),
      custom('tool.progress'),
      ...text('done'),
    ]
    const kept = await collect(sessionEventsToAgUi(feed(chunks)))
    expect(
      kept.some((e) => (e as any).name === 'harness.operation.started'),
    ).toBe(true)

    const dropped = await collect(
      sessionEventsToAgUi(feed(chunks), { includeHarnessEvents: false }),
    )
    expect(
      dropped.some((e) => (e as any).name === 'harness.operation.started'),
    ).toBe(false)
    // A non-harness CUSTOM event still flows through.
    expect(dropped.some((e) => (e as any).name === 'tool.progress')).toBe(true)
  })

  it('emits interim spend events with a running cumulative total', async () => {
    const out = await collect(
      sessionEventsToAgUi(
        feed([
          runFinished({ runId: 'r1', usage: [{ inputTokens: 10, outputTokens: 5 }] }),
          runFinished({ runId: 'r2', usage: [{ inputTokens: 2, outputTokens: 3 }] }),
        ]),
        { emitSpendEvents: true },
      ),
    )
    const spends = out.filter(
      (e) => e.type === EventType.CUSTOM && (e as any).name === TANSTACK_SPEND_EVENT,
    )
    expect(spends).toHaveLength(2)
    expect((spends[0] as any).value.cumulative.totalTokens).toBe(15)
    expect((spends[1] as any).value.usage.totalTokens).toBe(5)
    expect((spends[1] as any).value.cumulative.totalTokens).toBe(20)
    expect((spends[1] as any).value.runId).toBe('r2')
  })

  it('does not emit spend events when a run reports no usage', async () => {
    const out = await collect(
      sessionEventsToAgUi(feed(text('hi')), { emitSpendEvents: true }),
    )
    expect(
      out.some((e) => (e as any).name === TANSTACK_SPEND_EVENT),
    ).toBe(false)
  })
})

/** Build a POST request shaped like an AG-UI `RunAgentInput`. */
function runRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/agent', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    body: JSON.stringify({ tools: [], context: [], ...body }),
  })
}

/** Parse an SSE response body into AG-UI event objects. */
async function readSse(res: Response): Promise<Array<any>> {
  const raw = await res.text()
  return raw
    .split('\n\n')
    .filter(Boolean)
    .flatMap((block) => {
      const line = block.split('\n').find((l) => l.startsWith('data:'))
      return line ? [JSON.parse(line.slice(5).trim())] : []
    })
}

describe('createAgUiHandler', () => {
  it('streams a prompt run as AG-UI SSE', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const { adapter } = mockAdapter([() => text('hello there')])
    const harness = defineHarness({ name: 'test/agui', adapter })
    const handler = createAgUiHandler({
      host,
      harness,
      authorize: () => ({ id: 'u' }),
    })

    const res = await handler(
      runRequest({
        threadId: 't1',
        runId: 'run-1',
        messages: [{ id: 'u1', role: 'user', content: 'hi' }],
      }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/event-stream')

    const events = await readSse(res)
    expect(events.some((e) => e.type === EventType.RUN_STARTED)).toBe(true)
    const textOut = events
      .filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((e) => e.delta)
      .join('')
    expect(textOut).toContain('hello there')
    expect(events.some((e) => e.type === EventType.RUN_FINISHED)).toBe(true)
    await host.close()
  })

  it('rejects an unauthorized request with 401', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const { adapter } = mockAdapter([() => text('x')])
    const handler = createAgUiHandler({
      host,
      harness: defineHarness({ name: 'test/agui-401', adapter }),
      authorize: () => null,
    })
    const res = await handler(
      runRequest({ threadId: 't1', runId: 'r', messages: [] }),
    )
    expect(res.status).toBe(401)
    await host.close()
  })

  it('returns 400 for a malformed body', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const { adapter } = mockAdapter([() => text('x')])
    const handler = createAgUiHandler({
      host,
      harness: defineHarness({ name: 'test/agui-400', adapter }),
      authorize: () => ({ id: 'u' }),
    })
    // Missing threadId/runId → chatParamsFromRequestBody throws a Response.
    const res = await handler(
      new Request('http://localhost/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      }),
    )
    expect(res.status).toBe(400)
    await host.close()
  })

  it('runs the interrupt → resume round-trip over AG-UI', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const execute = vi.fn(async () => ({ ok: true }))
    const remove = toolDefinition({
      name: 'remove',
      description: 'Remove a file',
      needsApproval: true,
      inputSchema: z.object({ path: z.string() }),
    }).server(execute)
    const { adapter } = mockAdapter([
      () => toolCall('remove', { path: 'a.txt' }, 'call_1'),
      () => text('removed'),
    ])
    const harness = defineHarness({
      name: 'test/agui-approve',
      adapter,
      tools: [remove],
    })
    const handler = createAgUiHandler({
      host,
      harness,
      authorize: () => ({ id: 'u' }),
    })

    const messages = [{ id: 'u1', role: 'user', content: 'remove a.txt' }]
    const res1 = await handler(
      runRequest({ threadId: 't1', runId: 'run-1', messages }),
    )
    const events1 = await readSse(res1)

    expect(
      events1.some(
        (e) =>
          e.type === EventType.TOOL_CALL_START && e.toolCallName === 'remove',
      ),
    ).toBe(true)
    const interrupted = events1.find(
      (e) => e.type === EventType.RUN_FINISHED && e.outcome?.type === 'interrupt',
    )
    expect(interrupted).toBeDefined()
    expect(execute).not.toHaveBeenCalled()
    const interruptId = interrupted.outcome.interrupts[0].id

    const res2 = await handler(
      runRequest({
        threadId: 't1',
        runId: 'run-2',
        messages,
        resume: [{ interruptId, status: 'resolved', payload: true }],
      }),
    )
    const events2 = await readSse(res2)
    const textOut = events2
      .filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((e) => e.delta)
      .join('')
    expect(textOut).toContain('removed')
    expect(execute).toHaveBeenCalledWith({ path: 'a.txt' }, expect.anything())
    await host.close()
  })
})

describe('consumed by a bare @ag-ui/client HttpAgent', () => {
  it('runs a prompt and surfaces the assistant reply', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const { adapter } = mockAdapter([() => text('hello there')])
    const harness = defineHarness({ name: 'test/client-run', adapter })
    const handler = createAgUiHandler({
      host,
      harness,
      authorize: () => ({ id: 'u' }),
    })

    const agent = new HttpAgent({
      url: 'http://localhost/agent',
      threadId: 't1',
      fetch: (url: string, init: RequestInit) =>
        handler(new Request(url, init)),
    })
    agent.addMessage({ id: 'u1', role: 'user', content: 'hi' })
    await agent.runAgent()

    expect(JSON.stringify(agent.messages)).toContain('hello there')
    expect(agent.pendingInterrupts).toHaveLength(0)
    await host.close()
  })

  it('surfaces an approval as a pending interrupt', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const remove = toolDefinition({
      name: 'remove',
      description: 'Remove a file',
      needsApproval: true,
      inputSchema: z.object({ path: z.string() }),
    }).server(async () => ({ ok: true }))
    const { adapter } = mockAdapter([
      () => toolCall('remove', { path: 'a.txt' }, 'call_1'),
      () => text('removed'),
    ])
    const harness = defineHarness({
      name: 'test/client-approve',
      adapter,
      tools: [remove],
    })
    const handler = createAgUiHandler({
      host,
      harness,
      authorize: () => ({ id: 'u' }),
    })

    const agent = new HttpAgent({
      url: 'http://localhost/agent',
      threadId: 't1',
      fetch: (url: string, init: RequestInit) =>
        handler(new Request(url, init)),
    })
    agent.addMessage({ id: 'u1', role: 'user', content: 'remove a.txt' })
    await agent.runAgent()

    expect(agent.pendingInterrupts).toHaveLength(1)
    expect(agent.pendingInterrupts[0]?.toolCallId).toBe('call_1')
    await host.close()
  })
})
