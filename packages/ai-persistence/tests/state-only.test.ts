import { describe, expect, it } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import { memoryPersistence } from '../src/memory'
import { withChatPersistence } from '../src/middleware'

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

const script = (): Array<Array<StreamChunk>> => [
  [
    { type: EventType.RUN_STARTED, runId: 'r1', threadId: 't1', timestamp: 1 },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm1',
      delta: 'hello world',
      timestamp: 1,
    },
    {
      type: EventType.RUN_FINISHED,
      runId: 'r1',
      threadId: 't1',
      finishReason: 'stop',
      timestamp: 1,
    },
  ],
]

async function collect(stream: AsyncIterable<StreamChunk>) {
  const out: Array<StreamChunk> = []
  for await (const c of stream) out.push(c)
  return out
}

describe('state-only persistence', () => {
  it('exposes only state stores (no delivery event stores)', () => {
    const stores = memoryPersistence().stores as Record<string, unknown>
    expect('publicEvents' in stores).toBe(false)
    expect('internalEvents' in stores).toBe(false)
    // The delivery stream sink is gone too.
    expect('stream' in memoryPersistence()).toBe(false)
  })

  it('persists thread messages and run status', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter(script())

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect((await persistence.stores.runs!.get('r1'))?.status).toBe('completed')
    expect(
      (await persistence.stores.messages!.loadThread('t1')).length,
    ).toBeGreaterThan(0)
  })

  it('produces chunks byte-identical to a non-persisted run (no cursor)', async () => {
    const persisted = await collect(
      chat({
        adapter: mockAdapter(script()).adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(memoryPersistence())],
      }) as AsyncIterable<StreamChunk>,
    )

    const plain = await collect(
      chat({
        adapter: mockAdapter(script()).adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
      }) as AsyncIterable<StreamChunk>,
    )

    expect(JSON.stringify(persisted)).toEqual(JSON.stringify(plain))
    expect(persisted.every((c) => !('cursor' in c))).toBe(true)
  })
})
