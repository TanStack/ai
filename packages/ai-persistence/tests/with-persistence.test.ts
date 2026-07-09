import { describe, expect, it } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import { memoryPersistence } from '../src/memory'
import { withChatPersistence } from '../src/middleware'
import { defineAIPersistence } from '../src/types'

// --- minimal mock text adapter ---------------------------------------------

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

const ev = {
  runStarted: (runId = 'r1', threadId = 't1'): StreamChunk => ({
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    timestamp: 1,
  }),
  text: (delta: string): StreamChunk => ({
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm1',
    delta,
    timestamp: 1,
  }),
  runFinished: (runId = 'r1', threadId = 't1'): StreamChunk => ({
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    finishReason: 'stop',
    timestamp: 1,
  }),
  interrupted: (interruptId = 'interrupt-1'): StreamChunk => ({
    type: EventType.RUN_FINISHED,
    runId: 'r1',
    threadId: 't1',
    finishReason: 'stop',
    timestamp: 1,
    outcome: {
      type: 'interrupt',
      interrupts: [
        {
          id: interruptId,
          reason: 'approval_required',
          toolCallId: 'tool-1',
          metadata: { kind: 'approval' },
        },
      ],
    },
  }),
}

async function collect(stream: AsyncIterable<StreamChunk>) {
  const out: Array<StreamChunk> = []
  for await (const c of stream) out.push(c)
  return out
}

async function expectCollectRejects(
  stream: AsyncIterable<StreamChunk>,
  pattern: RegExp,
) {
  await expect(collect(stream)).rejects.toThrow(pattern)
}

describe('withChatPersistence (state-only)', () => {
  it('completes the run and saves the transcript', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([
      [ev.runStarted(), ev.text('hello'), ev.runFinished()],
    ])

    const chunks = await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    // The persistence middleware never stamps delivery cursors on the stream.
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.every((c) => !('cursor' in c))).toBe(true)

    // Run is completed and the transcript is saved.
    expect((await persistence.stores.runs!.get('r1'))?.status).toBe('completed')
    expect(
      (await persistence.stores.messages!.loadThread('t1')).length,
    ).toBeGreaterThan(0)
  })

  it('records an interrupt and marks the run interrupted', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([[ev.runStarted(), ev.interrupted()]])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect((await persistence.stores.runs!.get('r1'))?.status).toBe(
      'interrupted',
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )
  })

  it('blocks normal new input while a thread has pending interrupts', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[ev.runStarted(), ev.interrupted()]])

    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const next = mockAdapter([[ev.text('SHOULD NOT RUN')]])
    await expectCollectRejects(
      chat({
        adapter: next.adapter,
        messages: [{ role: 'user', content: 'new input' }],
        runId: 'r2',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
      /pending interrupts.*resume is required/i,
    )
    expect(next.calls.length).toBe(0)
  })

  it('requires resume entries to match all pending interrupts', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[ev.runStarted(), ev.interrupted()]])

    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const next = mockAdapter([[ev.text('SHOULD NOT RUN')]])
    await expectCollectRejects(
      chat({
        adapter: next.adapter,
        messages: [{ role: 'user', content: 'new input' }],
        runId: 'r2',
        threadId: 't1',
        resume: [{ interruptId: 'other-interrupt', status: 'resolved' }],
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
      /missing resume entry for pending interrupt interrupt-1/i,
    )
    expect(next.calls.length).toBe(0)
  })

  it('applies matching resume entries and then allows new input', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[ev.runStarted(), ev.interrupted()]])

    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const next = mockAdapter([[ev.runStarted('r2', 't1'), ev.text('fresh')]])
    const chunks = await collect(
      chat({
        adapter: next.adapter,
        messages: [{ role: 'user', content: 'new input' }],
        runId: 'r2',
        threadId: 't1',
        resume: [
          {
            interruptId: 'interrupt-1',
            status: 'resolved',
            payload: { approved: true },
          },
        ],
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(next.calls.length).toBe(1)
    expect(
      chunks.some((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT),
    ).toBe(true)
    expect(
      (await persistence.stores.interrupts!.get('interrupt-1'))?.status,
    ).toBe('resolved')
  })

  it('persists messages without requiring a run store', async () => {
    const full = memoryPersistence()
    const persistence = defineAIPersistence({
      stores: { messages: full.stores.messages },
    })
    const { adapter } = mockAdapter([
      [ev.runStarted(), ev.text('hello'), ev.runFinished()],
    ])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [
          withChatPersistence(persistence, { features: ['messages'] }),
        ],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(await persistence.stores.messages!.loadThread('t1')).not.toEqual([])
  })

  it('fails loudly when interrupts are requested without a run store', () => {
    const persistence = defineAIPersistence({
      stores: { messages: memoryPersistence().stores.messages },
    })

    expect(() =>
      withChatPersistence(persistence, { features: ['interrupts'] }),
    ).toThrow(/interrupts.*stores\.runs.*stores\.interrupts/i)
  })

  it('is a no-op without the middleware: the stream is unchanged', async () => {
    const { adapter } = mockAdapter([
      [ev.runStarted(), ev.text('plain'), ev.runFinished()],
    ])
    const chunks = await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
      }) as AsyncIterable<StreamChunk>,
    )
    expect(chunks.every((c) => !('cursor' in c))).toBe(true)
  })
})
