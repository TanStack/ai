import { describe, expect, it } from 'vitest'
import { EventType, chat, defineChatMiddleware } from '@tanstack/ai'
import {
  InMemoryLockStore,
  LocksCapability,
  getLocks,
  withLocks,
} from '@tanstack/ai/locks'
import type {
  AnyTextAdapter,
  ChatMiddlewareContext,
  StreamChunk,
} from '@tanstack/ai'
import type { LockStore } from '@tanstack/ai/locks'
import { memoryPersistence } from '../src/memory'
import { withPersistence } from '../src/middleware'
import {
  InterruptsCapability,
  PersistenceCapability,
  getInterrupts,
  getPersistence,
} from '../src/capabilities'
import type { AIPersistence, InterruptStore } from '../src'

function mockAdapter(chunks: Array<StreamChunk>) {
  return {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {},
    chatStream: () =>
      (async function* () {
        for (const c of chunks) yield c
      })(),
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  } as unknown as AnyTextAdapter
}

async function collect(stream: AsyncIterable<StreamChunk>) {
  const out: Array<StreamChunk> = []
  for await (const c of stream) out.push(c)
  return out
}

describe('persistence capabilities', () => {
  it('provides persistence and interrupts from withPersistence', async () => {
    const persistence = memoryPersistence()
    const seen: {
      persistence?: AIPersistence
      interrupts?: InterruptStore
    } = {}

    const consumer = defineChatMiddleware({
      name: 'capability-consumer',
      requires: [PersistenceCapability, InterruptsCapability],
      setup(ctx: ChatMiddlewareContext) {
        seen.persistence = getPersistence(ctx)
        seen.interrupts = getInterrupts(ctx)
      },
    })

    await collect(
      chat({
        adapter: mockAdapter([
          {
            type: EventType.RUN_STARTED,
            runId: 'r1',
            threadId: 't1',
            timestamp: 1,
          },
          {
            type: EventType.RUN_FINISHED,
            runId: 'r1',
            threadId: 't1',
            finishReason: 'stop',
            timestamp: 1,
          },
        ]),
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence), consumer],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(seen.persistence).toBe(persistence)
    expect(seen.interrupts).toBe(persistence.stores.interrupts)
  })

  it('provides locks from withLocks (separate from state persistence)', async () => {
    const persistence = memoryPersistence()
    const locks = new InMemoryLockStore()
    const seen: { locks?: LockStore } = {}

    const consumer = defineChatMiddleware({
      name: 'lock-consumer',
      requires: [LocksCapability],
      setup(ctx: ChatMiddlewareContext) {
        seen.locks = getLocks(ctx)
      },
    })

    await collect(
      chat({
        adapter: mockAdapter([
          {
            type: EventType.RUN_STARTED,
            runId: 'r1',
            threadId: 't1',
            timestamp: 1,
          },
          {
            type: EventType.RUN_FINISHED,
            runId: 'r1',
            threadId: 't1',
            finishReason: 'stop',
            timestamp: 1,
          },
        ]),
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence), withLocks(locks), consumer],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(seen.locks).toBe(locks)
  })
})
