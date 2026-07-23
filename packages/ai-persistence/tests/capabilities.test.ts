import { describe, expect, it } from 'vitest'
import { EventType, chat, defineChatMiddleware } from '@tanstack/ai'
import type {
  AnyTextAdapter,
  ChatMiddlewareContext,
  LockStore,
  StreamChunk,
} from '@tanstack/ai'
import { memoryPersistence } from '../src/memory'
import { withPersistence } from '../src/middleware'
import {
  InterruptsCapability,
  LocksCapability,
  PersistenceCapability,
  getInterrupts,
  getLocks,
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
  it('provides persistence, interrupts, and locks to downstream middleware', async () => {
    const persistence = memoryPersistence()
    const seen: {
      persistence?: AIPersistence
      interrupts?: InterruptStore
      locks?: LockStore
    } = {}

    const consumer = defineChatMiddleware({
      name: 'capability-consumer',
      requires: [PersistenceCapability, InterruptsCapability, LocksCapability],
      setup(ctx: ChatMiddlewareContext) {
        seen.persistence = getPersistence(ctx)
        seen.interrupts = getInterrupts(ctx)
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
        middleware: [withPersistence(persistence), consumer],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(seen.persistence).toBe(persistence)
    expect(seen.interrupts).toBe(persistence.stores.interrupts)
    expect(seen.locks).toBe(persistence.stores.locks)
  })
})

describe('createInterruptController', () => {
  it('delegates request/resolve/cancel/list to the underlying store', async () => {
    const persistence = memoryPersistence()
    const controller = createInterruptController({
      store: persistence.stores.interrupts!,
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
    expect((await persistence.stores.interrupts!.get('c1'))?.status).toBe(
      'resolved',
    )
    expect((await persistence.stores.interrupts!.get('c1'))?.response).toEqual({
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
    expect((await persistence.stores.interrupts!.get('c2'))?.status).toBe(
      'cancelled',
    )
  })

  it('creates interrupts in the pending state', async () => {
    const persistence = memoryPersistence()
    const controller = createInterruptController({
      store: persistence.stores.interrupts!,
    })
    await controller.request({
      interruptId: 'c1',
      runId: 'run-c',
      threadId: 'thread-c',
      requestedAt: 1,
      payload: {},
    })
    expect((await persistence.stores.interrupts!.get('c1'))?.status).toBe(
      'pending',
    )
  })
})
