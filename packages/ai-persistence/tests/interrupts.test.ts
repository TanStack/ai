import { describe, expect, it, vi } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import type { AnyTextAdapter, StreamChunk, Tool } from '@tanstack/ai'
import { memoryPersistence } from '../src/memory'
import { withPersistence } from '../src/middleware'

function mockAdapter(iterations: Array<Array<StreamChunk>>) {
  const calls: Array<unknown> = []
  let i = 0
  const adapter = {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {},
    chatStream: (opts: unknown) => {
      calls.push(opts)
      const chunks = iterations[i] ?? []
      i++
      return (async function* () {
        for (const c of chunks) yield c
      })()
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  } as unknown as AnyTextAdapter
  return { adapter, calls }
}

async function collect(stream: AsyncIterable<StreamChunk>) {
  const out: Array<StreamChunk> = []
  for await (const c of stream) out.push(c)
  return out
}

const interruptFinished = (): StreamChunk => ({
  type: EventType.RUN_FINISHED,
  runId: 'r1',
  threadId: 't1',
  finishReason: 'tool_calls',
  timestamp: 1,
  outcome: {
    type: 'interrupt',
    interrupts: [
      {
        id: 'interrupt-1',
        reason: 'tool_call',
        message: 'Approve the tool call?',
        toolCallId: 'tool-call-1',
      },
    ],
  },
})

const runStarted = (): StreamChunk => ({
  type: EventType.RUN_STARTED,
  runId: 'r1',
  threadId: 't1',
  timestamp: 1,
})

const toolStart = (): StreamChunk => ({
  type: EventType.TOOL_CALL_START,
  toolCallId: 'tool-call-1',
  toolCallName: 'clientSearch',
  toolName: 'clientSearch',
  timestamp: 1,
})

const toolArgs = (): StreamChunk => ({
  type: EventType.TOOL_CALL_ARGS,
  toolCallId: 'tool-call-1',
  delta: '{"query":"test"}',
  timestamp: 1,
})

const text = (delta: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId: 'm1',
  delta,
  timestamp: 1,
})

const runFinished = (runId = 'r1'): StreamChunk => ({
  type: EventType.RUN_FINISHED,
  runId,
  threadId: 't1',
  finishReason: 'stop',
  timestamp: 1,
})

const clientTool = (name: string): Tool => ({
  name,
  description: `${name} client tool`,
})

const approvalClientTool = (name: string): Tool => ({
  ...clientTool(name),
  needsApproval: true,
})

describe('interrupt persistence', () => {
  it('persists RUN_FINISHED interrupt outcomes as pending interrupt records', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([[runStarted(), interruptFinished()]])

    const chunks = await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const pending = await persistence.stores.interrupts!.listPending('t1')
    expect(pending).toHaveLength(1)
    expect(pending[0]?.interruptId).toBe('interrupt-1')
    expect((await persistence.stores.runs!.get('r1'))?.status).toBe(
      'interrupted',
    )
    // Persistence is state-only: it never stamps delivery cursors on the stream.
    expect(chunks.every((chunk) => !('cursor' in chunk))).toBe(true)
  })

  it('saves thread messages when a messages-enabled run pauses on an interrupt', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([[runStarted(), interruptFinished()]])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(await persistence.stores.messages!.loadThread('t1')).toEqual([
      { role: 'user', content: 'hi' },
    ])
  })

  it('does not persist duplicate records before terminal interrupt outcome', async () => {
    const persistence = memoryPersistence()
    const create = vi.spyOn(persistence.stores.interrupts!, 'create')
    const { adapter } = mockAdapter([
      [
        runStarted(),
        toolStart(),
        toolArgs(),
        {
          type: EventType.RUN_FINISHED,
          runId: 'r1',
          threadId: 't1',
          finishReason: 'tool_calls',
          timestamp: 1,
        },
      ],
    ])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        tools: [approvalClientTool('clientSearch')],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(create).toHaveBeenCalledTimes(1)
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )
  })

  it('blocks normal new input while a thread has pending interrupts', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'interrupt-1',
      runId: 'old-run',
      threadId: 't1',
      requestedAt: 1,
      payload: {},
    })
    const { adapter } = mockAdapter([[interruptFinished()]])

    await expect(
      collect(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'new input' }],
          runId: 'r2',
          threadId: 't1',
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow(/pending interrupt/i)

    expect(await persistence.stores.runs!.get('r2')).toBeNull()
  })

  it('treats resume entries as interrupt continuation on the same run', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[runStarted(), interruptFinished()]])
    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )

    const continuation = mockAdapter([
      [runStarted(), text('continued'), runFinished('r1')],
    ])
    const chunks = await collect(
      chat({
        adapter: continuation.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'interrupt-1',
            status: 'resolved',
            payload: { approved: true },
          },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(continuation.calls).toHaveLength(1)
    expect(chunks).toContainEqual(
      expect.objectContaining({ delta: 'continued' }),
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toEqual([])
    expect(
      (await persistence.stores.interrupts!.get('interrupt-1'))?.status,
    ).toBe('resolved')
  })

  it('applies persisted approval and client-tool resume decisions with empty client messages', async () => {
    const persistence = memoryPersistence()
    const toolCallChunks = () => [
      runStarted(),
      toolStart(),
      toolArgs(),
      {
        type: EventType.RUN_FINISHED,
        runId: 'r1',
        threadId: 't1',
        finishReason: 'tool_calls',
        timestamp: 1,
      } as StreamChunk,
    ]
    const first = mockAdapter([toolCallChunks()])
    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        tools: [approvalClientTool('clientSearch')],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const approvalInterrupt = await persistence.stores.interrupts!.get(
      'approval_tool-call-1',
    )
    expect(approvalInterrupt?.status).toBe('pending')

    const afterApproval = mockAdapter([toolCallChunks()])
    const approvalChunks = await collect(
      chat({
        adapter: afterApproval.adapter,
        messages: [],
        tools: [approvalClientTool('clientSearch')],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'approval_tool-call-1',
            status: 'resolved',
            payload: { approved: true },
          },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(afterApproval.calls).toHaveLength(1)
    expect(
      (
        afterApproval.calls[0] as { approvals?: ReadonlyMap<string, boolean> }
      ).approvals?.get('approval_tool-call-1'),
    ).toBe(true)
    expect(
      approvalChunks.find(
        (chunk) =>
          chunk.type === EventType.RUN_FINISHED &&
          chunk.outcome?.type === 'interrupt',
      ),
    ).toMatchObject({
      outcome: {
        interrupts: [
          {
            id: 'client_tool_tool-call-1',
            reason: 'client_tool_input',
            toolCallId: 'tool-call-1',
          },
        ],
      },
    })
    expect(
      (await persistence.stores.interrupts!.get('approval_tool-call-1'))
        ?.status,
    ).toBe('resolved')
    expect(
      (await persistence.stores.interrupts!.get('client_tool_tool-call-1'))
        ?.status,
    ).toBe('pending')

    const afterClientTool = mockAdapter([
      toolCallChunks(),
      [runStarted(), text('done'), runFinished('r1')],
    ])
    const finalChunks = await collect(
      chat({
        adapter: afterClientTool.adapter,
        messages: [],
        tools: [clientTool('clientSearch')],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'client_tool_tool-call-1',
            status: 'resolved',
            payload: { answer: 42 },
          },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(afterClientTool.calls).toHaveLength(2)
    expect(finalChunks).toContainEqual(
      expect.objectContaining({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'tool-call-1',
        content: JSON.stringify({ answer: 42 }),
      }),
    )
    expect(finalChunks).toContainEqual(
      expect.objectContaining({ delta: 'done' }),
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toEqual([])
  })

  it('rejects invalid resume entries against pending interrupts', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[runStarted(), interruptFinished()]])
    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const continuation = mockAdapter([[text('SHOULD NOT RUN')]])
    await expect(
      collect(
        chat({
          adapter: continuation.adapter,
          messages: [],
          runId: 'r1',
          threadId: 't1',
          resume: [],
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow(/pending interrupts.*resume is required/i)

    await expect(
      collect(
        chat({
          adapter: continuation.adapter,
          messages: [],
          runId: 'r1',
          threadId: 't1',
          resume: [{ interruptId: 'stale-interrupt', status: 'resolved' }],
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow(/missing resume entry.*interrupt-1/i)

    expect(continuation.calls).toHaveLength(0)
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )
  })

  it('rejects stale resume entries when a thread has no pending interrupts', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[runStarted(), text('done'), runFinished()]])
    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toEqual([])

    const continuation = mockAdapter([[text('SHOULD NOT RUN')]])
    await expect(
      collect(
        chat({
          adapter: continuation.adapter,
          messages: [],
          runId: 'r1',
          threadId: 't1',
          resume: [{ interruptId: 'stale-interrupt', status: 'resolved' }],
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow(/non-pending interrupt stale-interrupt/i)

    expect(continuation.calls).toHaveLength(0)
  })

  it('accepts resume only when every pending interrupt has a valid matching entry', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'interrupt-1',
      runId: 'old-run',
      threadId: 't1',
      requestedAt: 1,
      payload: {},
    })
    const bad = mockAdapter([[runStarted(), interruptFinished()]])

    await expect(
      collect(
        chat({
          adapter: bad.adapter,
          messages: [{ role: 'user', content: 'new input' }],
          runId: 'r2',
          threadId: 't1',
          resume: [{ interruptId: 'different', status: 'resolved' }],
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow(/missing resume entry.*interrupt-1/i)

    const good = mockAdapter([
      [runStarted(), { ...interruptFinished(), runId: 'r2' }],
    ])
    await collect(
      chat({
        adapter: good.adapter,
        messages: [{ role: 'user', content: 'new input' }],
        runId: 'r2',
        threadId: 't1',
        resume: [{ interruptId: 'interrupt-1', status: 'resolved' }],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(good.calls).toHaveLength(1)
  })

  it('rejects extra stale resume entries when pending interrupts are satisfied', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'interrupt-1',
      runId: 'old-run',
      threadId: 't1',
      requestedAt: 1,
      payload: {},
    })
    const run = mockAdapter([[text('SHOULD NOT RUN')]])

    await expect(
      collect(
        chat({
          adapter: run.adapter,
          messages: [{ role: 'user', content: 'new input' }],
          runId: 'r2',
          threadId: 't1',
          resume: [
            { interruptId: 'interrupt-1', status: 'resolved' },
            { interruptId: 'stale-interrupt', status: 'resolved' },
          ],
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow(/non-pending interrupt stale-interrupt/i)

    expect(run.calls).toHaveLength(0)
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )
  })

  it('applies valid resume entries and allows later normal input', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'resolve-me',
      runId: 'old-run',
      threadId: 't1',
      requestedAt: 1,
      payload: {},
    })
    await persistence.stores.interrupts!.create({
      interruptId: 'cancel-me',
      runId: 'old-run',
      threadId: 't1',
      requestedAt: 1,
      payload: {},
    })

    const resumeRun = mockAdapter([
      [runStarted(), text('ok'), runFinished('r2')],
    ])
    await collect(
      chat({
        adapter: resumeRun.adapter,
        messages: [{ role: 'user', content: 'resume' }],
        runId: 'r2',
        threadId: 't1',
        resume: [
          {
            interruptId: 'resolve-me',
            status: 'resolved',
            payload: { approved: true },
          },
          { interruptId: 'cancel-me', status: 'cancelled' },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(await persistence.stores.interrupts!.listPending('t1')).toEqual([])
    expect(
      (await persistence.stores.interrupts!.get('resolve-me'))?.status,
    ).toBe('resolved')
    expect(
      (await persistence.stores.interrupts!.get('resolve-me'))?.response,
    ).toEqual({ approved: true })
    expect(
      (await persistence.stores.interrupts!.get('cancel-me'))?.status,
    ).toBe('cancelled')

    const nextRun = mockAdapter([
      [runStarted(), text('next'), runFinished('r3')],
    ])
    await collect(
      chat({
        adapter: nextRun.adapter,
        messages: [{ role: 'user', content: 'next' }],
        runId: 'r3',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(nextRun.calls).toHaveLength(1)
  })

  it('marks terminal interrupt outcomes as interrupted', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([[runStarted(), interruptFinished()]])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect((await persistence.stores.runs!.get('r1'))?.status).toBe(
      'interrupted',
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )
  })

  it('keeps the interrupt pending when a resume run fails, and a retry succeeds', async () => {
    const persistence = memoryPersistence()

    // Run 1 pauses on an interrupt.
    const first = mockAdapter([[runStarted(), interruptFinished()]])
    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )

    // Run 2 (the resume) accepts the approval, then the provider fails
    // mid-stream (e.g. HTTP 500) before reaching any success boundary.
    const failing = {
      kind: 'text',
      name: 'mock',
      model: 'test-model',
      '~types': {},
      chatStream: () =>
        (async function* () {
          yield runStarted()
          throw new Error('provider 500')
        })(),
      structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    } as unknown as AnyTextAdapter

    await expect(
      collect(
        chat({
          adapter: failing,
          messages: [],
          runId: 'r1',
          threadId: 't1',
          resume: [
            {
              interruptId: 'interrupt-1',
              status: 'resolved',
              payload: { approved: true },
            },
          ],
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow('provider 500')

    // The approval was NOT consumed: the interrupt is pending again and the run
    // is marked failed.
    expect(
      (await persistence.stores.interrupts!.get('interrupt-1'))?.status,
    ).toBe('pending')
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )
    expect((await persistence.stores.runs!.get('r1'))?.status).toBe('failed')

    // Retrying with the same resume now succeeds and consumes the approval.
    const retry = mockAdapter([
      [runStarted(), text('continued'), runFinished('r1')],
    ])
    const chunks = await collect(
      chat({
        adapter: retry.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'interrupt-1',
            status: 'resolved',
            payload: { approved: true },
          },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(chunks).toContainEqual(
      expect.objectContaining({ delta: 'continued' }),
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toEqual([])
    expect(
      (await persistence.stores.interrupts!.get('interrupt-1'))?.status,
    ).toBe('resolved')
  })

  it('fails closed: an approval resume without an `approved` flag denies the tool', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'approval-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: { toolCallId: 'tc1', metadata: { kind: 'approval' } },
    })

    const run = mockAdapter([[runStarted(), text('ok'), runFinished('r1')]])
    await collect(
      chat({
        adapter: run.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        // Malformed/truncated persisted payload: no `approved` field.
        resume: [
          { interruptId: 'approval-1', status: 'resolved', payload: {} },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const approvals = (
      run.calls[0] as { approvals?: ReadonlyMap<string, boolean> }
    ).approvals
    expect(approvals?.get('approval-1')).toBe(false)
  })

  it('honors an explicit approved:true resume payload', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'approval-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: { toolCallId: 'tc1', metadata: { kind: 'approval' } },
    })

    const run = mockAdapter([[runStarted(), text('ok'), runFinished('r1')]])
    await collect(
      chat({
        adapter: run.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'approval-1',
            status: 'resolved',
            payload: { approved: true },
          },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const approvals = (
      run.calls[0] as { approvals?: ReadonlyMap<string, boolean> }
    ).approvals
    expect(approvals?.get('approval-1')).toBe(true)
  })

  it('denies the tool when an approval is cancelled', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'approval-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: { toolCallId: 'tc1', metadata: { kind: 'approval' } },
    })

    const run = mockAdapter([[runStarted(), text('ok'), runFinished('r1')]])
    await collect(
      chat({
        adapter: run.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [{ interruptId: 'approval-1', status: 'cancelled' }],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const approvals = (
      run.calls[0] as { approvals?: ReadonlyMap<string, boolean> }
    ).approvals
    expect(approvals?.get('approval-1')).toBe(false)
    expect(
      (await persistence.stores.interrupts!.get('approval-1'))?.status,
    ).toBe('cancelled')
  })

  it('drops the result of a cancelled client-tool interrupt', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'client-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: { toolCallId: 'tc1', metadata: { kind: 'client_tool' } },
    })

    const run = mockAdapter([[runStarted(), text('ok'), runFinished('r1')]])
    await collect(
      chat({
        adapter: run.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'client-1',
            status: 'cancelled',
            payload: { answer: 99 },
          },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    // A cancelled client tool never surfaces its payload as a tool result: the
    // resume state carries no entry for the tool call.
    const clientToolResults = (
      run.calls[0] as { clientToolResults?: ReadonlyMap<string, unknown> }
    ).clientToolResults
    expect(clientToolResults?.get('tc1')).toBeUndefined()
    expect((await persistence.stores.interrupts!.get('client-1'))?.status).toBe(
      'cancelled',
    )
  })

  it('tolerates malformed persisted interrupt payloads without crashing', async () => {
    const persistence = memoryPersistence()
    // Payload with the wrong shapes for the defensive parsers: metadata is a
    // string (not an object), toolCallId is a number.
    await persistence.stores.interrupts!.create({
      interruptId: 'weird-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: { metadata: 'not-an-object', toolCallId: 123 },
    })

    const run = mockAdapter([[runStarted(), text('ok'), runFinished('r1')]])
    await collect(
      chat({
        adapter: run.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [{ interruptId: 'weird-1', status: 'resolved', payload: {} }],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    // The run is unaffected (no approval/client-tool detected) and the resume is
    // still committed on success.
    expect(run.calls).toHaveLength(1)
    expect(
      (run.calls[0] as { approvals?: ReadonlyMap<string, boolean> }).approvals
        ?.size ?? 0,
    ).toBe(0)
    expect((await persistence.stores.interrupts!.get('weird-1'))?.status).toBe(
      'resolved',
    )
  })
})
