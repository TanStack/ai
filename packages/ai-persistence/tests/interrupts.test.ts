import { describe, expect, it, vi } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import type { AnyTextAdapter, StreamChunk, Tool } from '@tanstack/ai'
import { createApprovalController } from '../src/approval-controller'
import { memoryPersistence } from '../src/memory'
import { withChatPersistence } from '../src/middleware'
import { defineAIPersistence, validatePersistenceFeatures } from '../src/types'

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
  it('requires run, public event, and interrupt stores', () => {
    const stores = memoryPersistence().stores
    expect(() =>
      validatePersistenceFeatures(
        defineAIPersistence({
          stores: {
            runs: stores.runs,
            publicEvents: stores.publicEvents,
          },
        }),
        ['interrupts'],
      ),
    ).toThrow(/interrupts.*stores\.interrupts/i)
  })

  it('persists RUN_FINISHED interrupt outcomes as pending interrupt records', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([[runStarted(), interruptFinished()]])

    const chunks = await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [
          withChatPersistence(persistence, { features: ['interrupts'] }),
        ],
      }) as AsyncIterable<StreamChunk>,
    )

    const pending = await persistence.stores.interrupts!.listPending('t1')
    expect(pending).toHaveLength(1)
    expect(pending[0]?.interruptId).toBe('interrupt-1')
    expect((await persistence.stores.runs!.get('r1'))?.status).toBe(
      'interrupted',
    )
    expect(chunks.every((chunk) => typeof chunk.cursor === 'string')).toBe(true)
    expect(await persistence.stores.publicEvents!.latestSeq('r1')).toBe(2)
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
        middleware: [
          withChatPersistence(persistence, {
            features: ['messages', 'interrupts'],
          }),
        ],
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
        middleware: [
          withChatPersistence(persistence, { features: ['interrupts'] }),
        ],
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
      status: 'pending',
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
          middleware: [
            withChatPersistence(persistence, { features: ['interrupts'] }),
          ],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow(/pending interrupt/i)

    expect(await persistence.stores.runs!.get('r2')).toBeNull()
  })

  it('allows cursor replay on a thread with pending interrupts', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[runStarted(), interruptFinished()]])
    const original = await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [
          withChatPersistence(persistence, { features: ['interrupts'] }),
        ],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )

    const replayAdapter = mockAdapter([[text('SHOULD NOT RUN')]])
    const replay = await collect(
      chat({
        adapter: replayAdapter.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        cursor: original[0]!.cursor,
        middleware: [
          withChatPersistence(persistence, { features: ['interrupts'] }),
        ],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(replayAdapter.calls).toHaveLength(0)
    expect(replay.map((chunk) => chunk.cursor)).toEqual(
      original.slice(1).map((chunk) => chunk.cursor),
    )
  })

  it('treats cursor plus resume entries as interrupt continuation, not replay', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[runStarted(), interruptFinished()]])
    const original = await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [
          withChatPersistence(persistence, { features: ['interrupts'] }),
        ],
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
        cursor: original[0]!.cursor,
        resume: [
          {
            interruptId: 'interrupt-1',
            status: 'resolved',
            payload: { approved: true },
          },
        ],
        middleware: [
          withChatPersistence(persistence, { features: ['interrupts'] }),
        ],
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
    const original = await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        tools: [approvalClientTool('clientSearch')],
        runId: 'r1',
        threadId: 't1',
        middleware: [
          withChatPersistence(persistence, { features: ['interrupts'] }),
        ],
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
        cursor: original[0]!.cursor,
        resume: [
          {
            interruptId: 'approval_tool-call-1',
            status: 'resolved',
            payload: { approved: true },
          },
        ],
        middleware: [
          withChatPersistence(persistence, { features: ['interrupts'] }),
        ],
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
        cursor: approvalChunks[0]!.cursor,
        resume: [
          {
            interruptId: 'client_tool_tool-call-1',
            status: 'resolved',
            payload: { answer: 42 },
          },
        ],
        middleware: [
          withChatPersistence(persistence, { features: ['interrupts'] }),
        ],
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

  it('rejects invalid resume entries even when the cursor is valid', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[runStarted(), interruptFinished()]])
    const original = await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [
          withChatPersistence(persistence, { features: ['interrupts'] }),
        ],
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
          cursor: original[0]!.cursor,
          resume: [],
          middleware: [
            withChatPersistence(persistence, { features: ['interrupts'] }),
          ],
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
          cursor: original[0]!.cursor,
          resume: [{ interruptId: 'stale-interrupt', status: 'resolved' }],
          middleware: [
            withChatPersistence(persistence, { features: ['interrupts'] }),
          ],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow(/missing resume entry.*interrupt-1/i)

    expect(continuation.calls).toHaveLength(0)
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )
  })

  it('rejects stale resume entries when a valid cursor has no pending interrupts', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[runStarted(), text('done'), runFinished()]])
    const original = await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [
          withChatPersistence(persistence, { features: ['interrupts'] }),
        ],
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
          cursor: original[0]!.cursor,
          resume: [{ interruptId: 'stale-interrupt', status: 'resolved' }],
          middleware: [
            withChatPersistence(persistence, { features: ['interrupts'] }),
          ],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow(/non-pending interrupt stale-interrupt/i)

    expect(continuation.calls).toHaveLength(0)
  })

  it('blocks stale or unknown cursor input while a thread has pending interrupts', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'interrupt-1',
      runId: 'old-run',
      threadId: 't1',
      status: 'pending',
      requestedAt: 1,
      payload: {},
    })
    const { adapter } = mockAdapter([[text('SHOULD NOT RUN')]])

    await expect(
      collect(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'new input' }],
          runId: 'unknown-run',
          threadId: 't1',
          cursor: Buffer.from('1:unknown-run', 'utf8').toString('base64url'),
          middleware: [
            withChatPersistence(persistence, { features: ['interrupts'] }),
          ],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow(/unknown run unknown-run/i)
  })

  it('blocks wrong-thread cursor input while a thread has pending interrupts', async () => {
    const persistence = memoryPersistence()
    const other = mockAdapter([
      [runStarted(), text('other'), runFinished('r-other')],
    ])
    const otherChunks = await collect(
      chat({
        adapter: other.adapter,
        messages: [{ role: 'user', content: 'other' }],
        runId: 'r-other',
        threadId: 'other-thread',
        middleware: [
          withChatPersistence(persistence, { features: ['interrupts'] }),
        ],
      }) as AsyncIterable<StreamChunk>,
    )
    await persistence.stores.interrupts!.create({
      interruptId: 'interrupt-1',
      runId: 'old-run',
      threadId: 't1',
      status: 'pending',
      requestedAt: 1,
      payload: {},
    })
    const { adapter } = mockAdapter([[text('SHOULD NOT RUN')]])

    await expect(
      collect(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'new input' }],
          runId: 'r-other',
          threadId: 't1',
          cursor: otherChunks[0]!.cursor,
          middleware: [
            withChatPersistence(persistence, { features: ['interrupts'] }),
          ],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow(/belongs to thread other-thread, not request thread t1/i)
  })

  it('accepts resume only when every pending interrupt has a valid matching entry', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'interrupt-1',
      runId: 'old-run',
      threadId: 't1',
      status: 'pending',
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
          middleware: [
            withChatPersistence(persistence, { features: ['interrupts'] }),
          ],
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
        middleware: [
          withChatPersistence(persistence, { features: ['interrupts'] }),
        ],
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
      status: 'pending',
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
          middleware: [
            withChatPersistence(persistence, { features: ['interrupts'] }),
          ],
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
      status: 'pending',
      requestedAt: 1,
      payload: {},
    })
    await persistence.stores.interrupts!.create({
      interruptId: 'cancel-me',
      runId: 'old-run',
      threadId: 't1',
      status: 'pending',
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
        middleware: [
          withChatPersistence(persistence, { features: ['interrupts'] }),
        ],
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
        middleware: [
          withChatPersistence(persistence, { features: ['interrupts'] }),
        ],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(nextRun.calls).toHaveLength(1)
  })

  it('marks durable-replay terminal interrupt outcomes as interrupted', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([[runStarted(), interruptFinished()]])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [
          withChatPersistence(persistence, { features: ['durable-replay'] }),
        ],
      }) as AsyncIterable<StreamChunk>,
    )

    expect((await persistence.stores.runs!.get('r1'))?.status).toBe(
      'interrupted',
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toEqual([])
  })

  it('keeps deprecated approval controller behavior over interrupt storage', async () => {
    const persistence = memoryPersistence()
    const controller = createApprovalController({
      store: persistence.stores.interrupts!,
    })
    const secondController = createApprovalController({
      store: persistence.stores.interrupts!,
    })

    await controller.request({
      approvalId: 'approval-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: { tool: 'search' },
    })
    await secondController.resolve('approval-1', true)

    const decisions = await secondController.decisionsForThread('t1')
    expect(decisions.get('approval-1')).toBe(true)
  })
})
