import { describe, expect, it } from 'vitest'
import {
  EventType,
  InMemoryLockStore,
  chat,
  defineChatMiddleware,
} from '@tanstack/ai'
import { memoryPersistence, withChatPersistence } from '@tanstack/ai-persistence'
import {
  SandboxStoreCapability,
  defineSandbox,
  defineWorkspace,
  provideSandboxStore,
  withSandbox,
} from '../src'
import { InMemorySandboxStore } from '../src/store'
import { FULL_CAPS, makeFakeProvider } from './fakes'
import type {
  AnyTextAdapter,
  ChatMiddleware,
  LockStore,
  StreamChunk,
} from '@tanstack/ai'
import type { SandboxCapabilities } from '../src/contracts'
import type { SandboxStore } from '../src/store'

function adapter(): AnyTextAdapter {
  const mock = {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {},
    chatStream: () =>
      (async function* () {
        yield await Promise.resolve({
          type: EventType.RUN_FINISHED,
          runId: 'run',
          threadId: 'thread',
          finishReason: 'stop',
          timestamp: 1,
        } satisfies StreamChunk)
      })(),
    structuredOutput: () => Promise.resolve({ data: {}, rawText: '{}' }),
  }
  return mock as unknown as AnyTextAdapter
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<void> {
  for await (const _chunk of stream) {
    // drain
  }
}

function withExplicitSandboxStore(store: SandboxStore): ChatMiddleware {
  return defineChatMiddleware({
    name: 'explicit-sandbox-store',
    provides: [SandboxStoreCapability],
    setup(ctx) {
      provideSandboxStore(ctx, store)
    },
  })
}

function countingLockStore(base: LockStore): LockStore & { calls: number } {
  return {
    calls: 0,
    withLock(key, fn) {
      this.calls += 1
      return base.withLock(key, fn)
    },
  }
}

const workspace = defineWorkspace({ source: { type: 'none' } })

describe('withSandbox with direct persistence capabilities', () => {
  it('uses persistence locks and metadata to resume sandbox runs without the bridge', async () => {
    const persistence = memoryPersistence()
    const locks = countingLockStore(new InMemoryLockStore())
    persistence.stores.locks = locks
    const provider = makeFakeProvider()
    const sandbox = defineSandbox({
      id: 'direct-persistence',
      provider,
      workspace,
      fileEvents: false,
    })

    await collect(
      chat({
        adapter: adapter(),
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [{ role: 'user', content: 'first' }],
        middleware: [withChatPersistence(persistence), withSandbox(sandbox)],
      }),
    )
    await collect(
      chat({
        adapter: adapter(),
        threadId: 'thread-1',
        runId: 'run-2',
        messages: [{ role: 'user', content: 'second' }],
        middleware: [withChatPersistence(persistence), withSandbox(sandbox)],
      }),
    )

    expect(locks.calls).toBe(2)
    expect(provider.calls.create).toBe(1)
    expect(provider.calls.resume).toBe(1)
  })

  it('restores sandbox state from persistence metadata when resume falls back to snapshots', async () => {
    const persistence = memoryPersistence()
    const ephemeralCaps: SandboxCapabilities = {
      ...FULL_CAPS,
      durableFilesystem: false,
    }
    const provider = makeFakeProvider({
      resumeReturnsNull: true,
      caps: ephemeralCaps,
    })
    const sandbox = defineSandbox({
      id: 'metadata-snapshot',
      provider,
      workspace,
      fileEvents: false,
      lifecycle: { reuse: 'thread', snapshot: 'after-setup' },
    })

    await collect(
      chat({
        adapter: adapter(),
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [{ role: 'user', content: 'first' }],
        middleware: [withChatPersistence(persistence), withSandbox(sandbox)],
      }),
    )
    await collect(
      chat({
        adapter: adapter(),
        threadId: 'thread-1',
        runId: 'run-2',
        messages: [{ role: 'user', content: 'second' }],
        middleware: [withChatPersistence(persistence), withSandbox(sandbox)],
      }),
    )

    expect(provider.calls.create).toBe(1)
    expect(provider.calls.resume).toBe(1)
    expect(provider.calls.restoreSnapshot).toBe(1)
  })

  it('prefers an explicit sandbox store over the persistence-derived store', async () => {
    const persistence = memoryPersistence()
    const explicitStore = new InMemorySandboxStore()
    const provider = makeFakeProvider()
    const sandbox = defineSandbox({
      id: 'explicit-store',
      provider,
      workspace,
      fileEvents: false,
    })

    await collect(
      chat({
        adapter: adapter(),
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [{ role: 'user', content: 'first' }],
        middleware: [
          withChatPersistence(persistence),
          withExplicitSandboxStore(explicitStore),
          withSandbox(sandbox),
        ],
      }),
    )

    const key = sandbox.key({ threadId: 'thread-1', runId: 'run-1' })
    expect(await explicitStore.get(key)).not.toBeNull()
    expect(
      await persistence.stores.metadata?.get('tanstack.ai.sandbox', key),
    ).toBeNull()
  })
})
