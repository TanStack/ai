import { describe, expect, it } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import { InMemoryLockStore, withLocks } from '@tanstack/ai/locks'
import {
  InMemorySandboxInstanceStore,
  defineSandbox,
  defineWorkspace,
  withSandbox,
  withSandboxInstanceStore,
} from '../src'
import { FULL_CAPS, makeFakeProvider } from './fakes'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

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

const terminalChunks = (runId: string, threadId: string): Array<StreamChunk> => [
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

describe('withSandbox resume from withSandboxInstanceStore', () => {
  it('second chat run resumes the provider sandbox recorded by the first', async () => {
    const instanceStore = new InMemorySandboxInstanceStore()
    const locks = new InMemoryLockStore()
    const provider = makeFakeProvider({ caps: FULL_CAPS })
    const sandbox = defineSandbox({
      id: 'repo',
      provider,
      workspace: defineWorkspace({ source: { type: 'none' } }),
      // No watcher — unit test only cares about ensure + store wiring.
      fileEvents: false,
    })

    const run = async (runId: string) =>
      collect(
        chat({
          adapter: mockAdapter(terminalChunks(runId, 'thread-1')),
          messages: [{ role: 'user', content: 'hi' }],
          runId,
          threadId: 'thread-1',
          middleware: [
            withSandboxInstanceStore(instanceStore),
            withLocks(locks),
            withSandbox(sandbox),
          ],
        }) as AsyncIterable<StreamChunk>,
      )

    await run('run-1')
    expect(provider.calls.create).toBe(1)
    expect(provider.calls.resume).toBe(0)

    await run('run-2')
    expect(provider.calls.create).toBe(1)
    expect(provider.calls.resume).toBe(1)

    const key = sandbox.key({
      threadId: 'thread-1',
      runId: 'run-2',
    })
    const rec = await instanceStore.get(key)
    expect(rec?.latestRunId).toBe('run-2')
    expect(rec?.providerSandboxId).toBeTruthy()
  })
})
