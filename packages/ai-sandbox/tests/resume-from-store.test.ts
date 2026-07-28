import { describe, expect, it } from 'vitest'
import { EventType, chat, defineChatMiddleware } from '@tanstack/ai'
import { InMemoryLockStore, withLocks } from '@tanstack/ai/locks'
import {
  InMemorySandboxInstanceStore,
  SandboxInstanceStoreCapability,
  defineSandbox,
  defineWorkspace,
  provideSandboxInstanceStore,
  withSandbox,
} from '../src'
import { FULL_CAPS, makeFakeProvider } from './fakes'
import type { AnyTextAdapter, ChatMiddleware, StreamChunk } from '@tanstack/ai'
import type { SandboxInstanceStore } from '../src'

function mockAdapter(chunks: Array<StreamChunk>): AnyTextAdapter {
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

const terminalChunks = (
  runId: string,
  threadId: string,
): Array<StreamChunk> => [
  {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    timestamp: 1,
  },
  {
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    finishReason: 'stop',
    timestamp: 1,
  },
]

/** Ambient (platform-style) wiring: put a store on the capability bus. */
function withAmbientInstanceStore(store: SandboxInstanceStore): ChatMiddleware {
  return defineChatMiddleware({
    name: 'ambient-instance-store',
    provides: [SandboxInstanceStoreCapability],
    setup(ctx) {
      provideSandboxInstanceStore(ctx, store)
    },
  })
}

function fakeSandbox() {
  const provider = makeFakeProvider({ caps: FULL_CAPS })
  const sandbox = defineSandbox({
    id: 'repo',
    provider,
    workspace: defineWorkspace({ source: { type: 'none' } }),
    // No watcher — these tests only care about ensure + store wiring.
    fileEvents: false,
  })
  return { provider, sandbox }
}

describe('withSandbox durable instance resume', () => {
  it('second chat run resumes the sandbox recorded by the first', async () => {
    const instanceStore = new InMemorySandboxInstanceStore()
    const locks = new InMemoryLockStore()
    const { provider, sandbox } = fakeSandbox()

    const run = async (runId: string) =>
      collect(
        chat({
          adapter: mockAdapter(terminalChunks(runId, 'thread-1')),
          messages: [{ role: 'user', content: 'hi' }],
          runId,
          threadId: 'thread-1',
          middleware: [
            withLocks(locks),
            withSandbox(sandbox, { instances: instanceStore }),
          ],
        }) as AsyncIterable<StreamChunk>,
      )

    await run('run-1')
    expect(provider.calls.create).toBe(1)
    expect(provider.calls.resume).toBe(0)

    await run('run-2')
    expect(provider.calls.create).toBe(1)
    expect(provider.calls.resume).toBe(1)

    const key = sandbox.key({ threadId: 'thread-1', runId: 'run-2' })
    const rec = await instanceStore.get(key)
    expect(rec?.latestRunId).toBe('run-2')
    expect(rec?.providerSandboxId).toBeTruthy()
  })

  it('accepts the lock as an option instead of withLocks', async () => {
    const instanceStore = new InMemorySandboxInstanceStore()
    const { provider, sandbox } = fakeSandbox()

    const run = async (runId: string) =>
      collect(
        chat({
          adapter: mockAdapter(terminalChunks(runId, 'thread-1')),
          messages: [{ role: 'user', content: 'hi' }],
          runId,
          threadId: 'thread-1',
          middleware: [
            withSandbox(sandbox, {
              instances: instanceStore,
              locks: new InMemoryLockStore(),
            }),
          ],
        }) as AsyncIterable<StreamChunk>,
      )

    await run('run-1')
    await run('run-2')
    expect(provider.calls.create).toBe(1)
    expect(provider.calls.resume).toBe(1)
  })

  it('falls back to an ambient store provided on the capability bus', async () => {
    const ambient = new InMemorySandboxInstanceStore()
    const { provider, sandbox } = fakeSandbox()

    const run = async (runId: string) =>
      collect(
        chat({
          adapter: mockAdapter(terminalChunks(runId, 'thread-1')),
          messages: [{ role: 'user', content: 'hi' }],
          runId,
          threadId: 'thread-1',
          // No `instances` option — the bus-provided store is used.
          middleware: [withAmbientInstanceStore(ambient), withSandbox(sandbox)],
        }) as AsyncIterable<StreamChunk>,
      )

    await run('run-1')
    await run('run-2')
    expect(provider.calls.resume).toBe(1)

    const key = sandbox.key({ threadId: 'thread-1', runId: 'run-2' })
    expect(await ambient.get(key)).not.toBeNull()
  })

  it('prefers the explicit option over an ambient bus store', async () => {
    const ambient = new InMemorySandboxInstanceStore()
    const explicit = new InMemorySandboxInstanceStore()
    const { sandbox } = fakeSandbox()

    await collect(
      chat({
        adapter: mockAdapter(terminalChunks('run-1', 'thread-1')),
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'run-1',
        threadId: 'thread-1',
        middleware: [
          withAmbientInstanceStore(ambient),
          withSandbox(sandbox, { instances: explicit }),
        ],
      }) as AsyncIterable<StreamChunk>,
    )

    const key = sandbox.key({ threadId: 'thread-1', runId: 'run-1' })
    // The call-site option won: only the explicit store was written.
    expect(await explicit.get(key)).not.toBeNull()
    expect(await ambient.get(key)).toBeNull()
  })
})
