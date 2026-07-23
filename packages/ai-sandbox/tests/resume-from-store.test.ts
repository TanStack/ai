import { describe, expect, it } from 'vitest'
import { EventType, chat, defineChatMiddleware } from '@tanstack/ai'
import { withSandbox } from '../src/middleware'
import { defineSandbox } from '../src/sandbox'
import { defineWorkspace } from '../src/workspace'
import {
  LocksCapability,
  SandboxStoreCapability,
  provideLocks,
  provideSandboxStore,
} from '../src/capabilities'
import { InMemoryLockStore, InMemorySandboxStore } from '../src/store'
import { makeFakeProvider } from './fakes'
import type {
  AnyTextAdapter,
  LockStore,
  SandboxStore,
  StreamChunk,
} from '@tanstack/ai'

function mockAdapter(): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {},
    chatStream: ({ runId, threadId }: { runId: string; threadId: string }) =>
      (async function* (): AsyncGenerator<StreamChunk> {
        yield { type: EventType.RUN_STARTED, runId, threadId, timestamp: 1 }
        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          finishReason: 'stop',
          timestamp: 1,
        }
      })(),
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  } as unknown as AnyTextAdapter
}

/**
 * Stand-in for the durable store `withPersistence` provides: a middleware that
 * puts a `SandboxStore` (and lock) on the shared capabilities so `withSandbox`
 * consumes them in `ensure`.
 */
function provideStores(store: SandboxStore, locks: LockStore) {
  return defineChatMiddleware({
    name: 'test-provide-sandbox-stores',
    provides: [SandboxStoreCapability, LocksCapability],
    setup(ctx) {
      provideSandboxStore(ctx, store)
      provideLocks(ctx, locks)
    },
  })
}

async function drain(stream: AsyncIterable<StreamChunk>): Promise<void> {
  for await (const _ of stream) void _
}

describe('withSandbox resume from a provided store', () => {
  it('resumes the persisted sandbox across runs instead of re-creating it', async () => {
    const provider = makeFakeProvider()
    const store = new InMemorySandboxStore()
    const locks = new InMemoryLockStore()
    const sandbox = defineSandbox({
      id: 'repo',
      provider,
      workspace: defineWorkspace({ source: { type: 'none' } }),
      fileEvents: false,
    })

    const run = (runId: string) =>
      drain(
        chat({
          adapter: mockAdapter(),
          messages: [{ role: 'user', content: 'hi' }],
          runId,
          threadId: 'thread-1',
          middleware: [provideStores(store, locks), withSandbox(sandbox)],
        }),
      )

    await run('run-1')
    await run('run-2')

    // The record persisted in the provided store across runs, so the second
    // ensure resumed rather than creating a second sandbox.
    expect(provider.calls.create).toBe(1)
    expect(provider.calls.resume).toBe(1)
  })
})
