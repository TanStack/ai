import { describe, expect, it } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import { encodeCursor } from '../src/cursor'
import { memoryPersistence } from '../src/memory'
import { withChatPersistence } from '../src/middleware'
import { createResumeSource } from '../src/resume-source'
import { defineAIPersistence } from '../src/types'
import type { PersistedPublicEvent, PublicEventStore } from '../src/types'

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

function sparsePublicEvents(
  runId: string,
  event: StreamChunk,
): PublicEventStore {
  const persisted: PersistedPublicEvent = {
    seq: 2,
    cursor: encodeCursor(runId, 2),
    event: { ...event, cursor: encodeCursor(runId, 2) },
  }
  return {
    append: async () => persisted,
    read: (requestedRunId, opts) =>
      (async function* () {
        if (requestedRunId !== runId) return
        if ((opts?.afterSeq ?? -Infinity) < persisted.seq) {
          yield persisted
        }
      })(),
    hasRun: async (requestedRunId) => requestedRunId === runId,
    latestSeq: async (requestedRunId) => (requestedRunId === runId ? 2 : 0),
  }
}

describe('withChatPersistence (no sandbox)', () => {
  it('persists events with cursors, completes the run, and saves the transcript', async () => {
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

    // Every emitted chunk carries an in-band cursor.
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.every((c) => typeof c.cursor === 'string')).toBe(true)

    // Events are in the log, run is completed, transcript saved.
    expect(await persistence.stores.publicEvents!.hasRun('r1')).toBe(true)
    expect((await persistence.stores.runs!.get('r1'))?.status).toBe('completed')
    expect(
      (await persistence.stores.messages!.loadThread('t1')).length,
    ).toBeGreaterThan(0)
  })

  it('resumes by replaying events after the cursor without running the adapter', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([
      [ev.runStarted(), ev.text('hello'), ev.text(' world'), ev.runFinished()],
    ])

    const original = await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    // Resume from the first chunk's cursor — should replay the rest, no adapter.
    const afterCursor = original[0]!.cursor!
    const resumeAdapter = mockAdapter([[ev.text('SHOULD NOT RUN')]])
    const replay = await collect(
      chat({
        adapter: resumeAdapter.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        cursor: afterCursor,
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(resumeAdapter.calls.length).toBe(0)
    // Replayed cursors are exactly the original tail after the resume point.
    expect(replay.map((c) => c.cursor)).toEqual(
      original.slice(1).map((c) => c.cursor),
    )
  })

  it('fails loudly when the cursor run id does not match the request run id', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[ev.runStarted(), ev.text('hello')]])

    const original = await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const resumeAdapter = mockAdapter([[ev.text('SHOULD NOT RUN')]])
    await expectCollectRejects(
      chat({
        adapter: resumeAdapter.adapter,
        messages: [],
        runId: 'r2',
        threadId: 't1',
        cursor: original[0]!.cursor!,
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
      /cursor runId r1 does not match request runId r2/i,
    )
    expect(resumeAdapter.calls.length).toBe(0)
  })

  it('fails loudly when the persisted run thread does not match the request thread', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[ev.runStarted(), ev.text('hello')]])

    const original = await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const resumeAdapter = mockAdapter([[ev.text('SHOULD NOT RUN')]])
    await expectCollectRejects(
      chat({
        adapter: resumeAdapter.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't2',
        cursor: original[0]!.cursor!,
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
      /belongs to thread t1, not request thread t2/i,
    )
    expect(resumeAdapter.calls.length).toBe(0)
  })

  it('fails loudly when the cursor points beyond persisted public events', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[ev.runStarted(), ev.text('hello')]])

    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const resumeAdapter = mockAdapter([[ev.text('SHOULD NOT RUN')]])
    await expectCollectRejects(
      chat({
        adapter: resumeAdapter.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        cursor: encodeCursor('r1', 999),
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
      /beyond latest persisted sequence/i,
    )
    expect(resumeAdapter.calls.length).toBe(0)
  })

  it('fails loudly when the cursor sequence is zero', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[ev.runStarted(), ev.text('hello')]])

    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const resumeAdapter = mockAdapter([[ev.text('SHOULD NOT RUN')]])
    await expectCollectRejects(
      chat({
        adapter: resumeAdapter.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        cursor: encodeCursor('r1', 0),
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
      /sequence 0 is invalid/i,
    )
    expect(resumeAdapter.calls.length).toBe(0)
  })

  it('fails loudly when the cursor sequence is missing from a sparse public event log', async () => {
    const full = memoryPersistence()
    await full.stores.runs!.createOrResume({
      runId: 'r1',
      threadId: 't1',
      startedAt: 1,
    })
    const persistence = defineAIPersistence({
      stores: {
        runs: full.stores.runs,
        publicEvents: sparsePublicEvents('r1', ev.text('tail')),
      },
    })
    const resumeAdapter = mockAdapter([[ev.text('SHOULD NOT RUN')]])

    await expectCollectRejects(
      chat({
        adapter: resumeAdapter.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        cursor: encodeCursor('r1', 1),
        middleware: [
          withChatPersistence(persistence, { features: ['durable-replay'] }),
        ],
      }) as AsyncIterable<StreamChunk>,
      /sequence 1 does not reference a persisted public event/i,
    )
    expect(resumeAdapter.calls.length).toBe(0)
  })

  it('fails loudly when the cursor references an unknown run', async () => {
    const persistence = memoryPersistence()
    const resumeAdapter = mockAdapter([[ev.text('SHOULD NOT RUN')]])

    await expectCollectRejects(
      chat({
        adapter: resumeAdapter.adapter,
        messages: [],
        runId: 'missing-run',
        threadId: 't1',
        cursor: encodeCursor('missing-run', 1),
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
      /unknown run missing-run/i,
    )
    expect(resumeAdapter.calls.length).toBe(0)
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

  it('does not let a forged in-range cursor bypass pending interrupts', async () => {
    const full = memoryPersistence()
    await full.stores.runs!.createOrResume({
      runId: 'r1',
      threadId: 't1',
      startedAt: 1,
    })
    await full.stores.interrupts!.create({
      interruptId: 'interrupt-1',
      runId: 'r1',
      threadId: 't1',
      status: 'pending',
      requestedAt: 1,
      payload: {},
    })
    const persistence = defineAIPersistence({
      stores: {
        runs: full.stores.runs,
        publicEvents: sparsePublicEvents('r1', ev.text('tail')),
        interrupts: full.stores.interrupts,
      },
    })

    const resumeAdapter = mockAdapter([[ev.text('SHOULD NOT RUN')]])
    await expectCollectRejects(
      chat({
        adapter: resumeAdapter.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        cursor: encodeCursor('r1', 1),
        middleware: [
          withChatPersistence(persistence, { features: ['interrupts'] }),
        ],
      }) as AsyncIterable<StreamChunk>,
      /sequence 1 does not reference a persisted public event/i,
    )

    expect(resumeAdapter.calls.length).toBe(0)
    expect(await full.stores.interrupts!.listPending('t1')).toHaveLength(1)
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

  it('does not block new input for internal/background waits without public interrupts', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.internalEvents!.append({
      runId: 'internal-run',
      expectedSeq: 0,
      namespace: 'background',
      type: 'wait',
      payload: { reason: 'background' },
    })

    const next = mockAdapter([[ev.runStarted('r2', 't1'), ev.text('fresh')]])
    const chunks = await collect(
      chat({
        adapter: next.adapter,
        messages: [{ role: 'user', content: 'new input' }],
        runId: 'r2',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(next.calls.length).toBe(1)
    expect(
      chunks.some((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT),
    ).toBe(true)
  })

  it('requires a run record for persistence-backed resume source replay when a run store is provided', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.publicEvents!.append({
      runId: 'ghost-run',
      expectedSeq: 0,
      event: { ...ev.text('ghost'), cursor: encodeCursor('ghost-run', 1) },
    })

    const source = createResumeSource(
      persistence.stores.publicEvents!,
      persistence.stores.runs,
    )

    await expect(source.hasRun('ghost-run')).resolves.toBe(false)
    await expect(
      collect(source.replay('ghost-run', encodeCursor('ghost-run', 1))),
    ).rejects.toThrow(/unknown run ghost-run/i)
  })

  it('persists messages without requiring event stores', async () => {
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
        middleware: [withChatPersistence(persistence, { features: ['messages'] })],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(await persistence.stores.messages!.loadThread('t1')).not.toEqual([])
  })

  it('treats cursor as a no-op with messages-only persistence', async () => {
    const full = memoryPersistence()
    const persistence = defineAIPersistence({
      stores: { messages: full.stores.messages },
    })
    const { adapter, calls } = mockAdapter([
      [ev.runStarted(), ev.text('hello'), ev.runFinished()],
    ])

    const chunks = await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        cursor: 'not-a-persistence-cursor',
        middleware: [withChatPersistence(persistence, { features: ['messages'] })],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(calls.length).toBe(1)
    expect(chunks.every((chunk) => chunk.cursor === undefined)).toBe(true)
    expect(await persistence.stores.messages!.loadThread('t1')).not.toEqual([])
  })

  it('throws a descriptive error when durable replay is requested without event stores', async () => {
    const persistence = defineAIPersistence({
      stores: { messages: memoryPersistence().stores.messages },
    })
    const { adapter } = mockAdapter([[ev.text('unused')]])

    expect(() =>
      withChatPersistence(persistence, { features: ['durable-replay'] }),
    ).toThrow(/durable-replay.*stores\.runs.*stores\.publicEvents/i)
    void adapter
  })

  it('is a no-op without the middleware: chunks carry no cursor', async () => {
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
    expect(chunks.every((c) => c.cursor === undefined)).toBe(true)
  })
})
