import { describe, expect, it } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import { memoryPersistence } from '../src/memory'
import { withPersistence } from '../src/middleware'

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
}

async function collect(stream: AsyncIterable<StreamChunk>) {
  const out: Array<StreamChunk> = []
  for await (const c of stream) out.push(c)
  return out
}

describe('withPersistence (no sandbox)', () => {
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
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    // Every emitted chunk carries an in-band cursor.
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.every((c) => typeof c.cursor === 'string')).toBe(true)

    // Events are in the log, run is completed, transcript saved.
    expect(await persistence.events!.hasRun('r1')).toBe(true)
    expect((await persistence.runs!.get('r1'))?.status).toBe('completed')
    expect((await persistence.messages!.loadThread('t1')).length).toBeGreaterThan(
      0,
    )
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
        middleware: [withPersistence(persistence)],
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
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(resumeAdapter.calls.length).toBe(0)
    // Replayed cursors are exactly the original tail after the resume point.
    expect(replay.map((c) => c.cursor)).toEqual(
      original.slice(1).map((c) => c.cursor),
    )
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
