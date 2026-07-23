import { describe, expect, it } from 'vitest'
import { EventType, InMemoryLockStore, chat } from '@tanstack/ai'
import { withSandboxPersistence } from '../src/persistence'
import { withSandbox } from '../src/middleware'
import { defineSandbox } from '../src/sandbox'
import { defineWorkspace } from '../src/workspace'
import { InMemorySandboxStore } from '../src/store'
import { makeFakeProvider } from './fakes'
import type {
  AnyTextAdapter,
  ChatMiddlewareContext,
  StreamChunk,
} from '@tanstack/ai'
import { getLocks, getSandboxStore } from '../src/capabilities'
import { defineChatMiddleware } from '@tanstack/ai'

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

async function drain(stream: AsyncIterable<StreamChunk>): Promise<void> {
  for await (const _ of stream) void _
}

describe('withSandboxPersistence', () => {
  it('provides the sandbox store and lock to downstream middleware', async () => {
    const store = new InMemorySandboxStore()
    const locks = new InMemoryLockStore()
    const seen: { store?: unknown; locks?: unknown } = {}

    const consumer = defineChatMiddleware({
      name: 'reads-sandbox-persistence',
      setup(ctx: ChatMiddlewareContext) {
        seen.store = getSandboxStore(ctx, { optional: true })
        seen.locks = getLocks(ctx, { optional: true })
      },
    })

    await drain(
      chat({
        adapter: mockAdapter(),
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'run-1',
        threadId: 'thread-1',
        middleware: [withSandboxPersistence({ store, locks }), consumer],
      }),
    )

    expect(seen.store).toBe(store)
    expect(seen.locks).toBe(locks)
  })

  it('omits the lock capability when no lock store is supplied', async () => {
    const store = new InMemorySandboxStore()
    const seen: { locks?: unknown } = {}

    const consumer = defineChatMiddleware({
      name: 'reads-lock',
      setup(ctx: ChatMiddlewareContext) {
        seen.locks = getLocks(ctx, { optional: true })
      },
    })

    await drain(
      chat({
        adapter: mockAdapter(),
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'run-1',
        threadId: 'thread-1',
        middleware: [withSandboxPersistence({ store }), consumer],
      }),
    )

    expect(seen.locks).toBeUndefined()
  })

  it('resumes the same sandbox across runs via the injected durable store', async () => {
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
          middleware: [
            withSandboxPersistence({ store, locks }),
            withSandbox(sandbox),
          ],
        }),
      )

    await run('run-1')
    await run('run-2')

    // The record persisted in the injected store across runs, so the second
    // ensure resumed instead of creating a second sandbox.
    expect(provider.calls.create).toBe(1)
    expect(provider.calls.resume).toBe(1)
  })
})
