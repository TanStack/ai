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
import { createInterruptController } from '../src/interrupts'
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

describe('createInterruptController', () => {
  it('delegates request/resolve/cancel/list to the underlying store', async () => {
    const persistence = memoryPersistence()
    const interruptStore = persistence.stores.interrupts
    expect(interruptStore).toBeDefined()
    const controller = createInterruptController({
      store: interruptStore,
    })

    await controller.request({
      interruptId: 'c1',
      runId: 'run-c',
      threadId: 'thread-c',
      requestedAt: 1,
      payload: { kind: 'approval' },
    })
    expect(await controller.listPending('thread-c')).toHaveLength(1)
    expect(await controller.listPendingByRun('run-c')).toHaveLength(1)

    await controller.resolve('c1', { approved: true })
    expect((await interruptStore.get('c1'))?.status).toBe('resolved')
    expect((await interruptStore.get('c1'))?.response).toEqual({
      approved: true,
    })
    expect(await controller.listPending('thread-c')).toHaveLength(0)

    await controller.request({
      interruptId: 'c2',
      runId: 'run-c',
      threadId: 'thread-c',
      requestedAt: 2,
      payload: {},
    })
    await controller.cancel('c2')
    expect((await interruptStore.get('c2'))?.status).toBe('cancelled')
  })

  it('creates interrupts in the pending state', async () => {
    const persistence = memoryPersistence()
    const interruptStore = persistence.stores.interrupts
    expect(interruptStore).toBeDefined()
    const controller = createInterruptController({
      store: interruptStore,
    })
    await controller.request({
      interruptId: 'c1',
      runId: 'run-c',
      threadId: 'thread-c',
      requestedAt: 1,
      payload: {},
    })
    expect((await interruptStore.get('c1'))?.status).toBe('pending')
  })
})
