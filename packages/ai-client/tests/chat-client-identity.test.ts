import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import { createMockPersistence, createTextChunks } from './test-utils'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from '../src/connection-adapters'

function createCapturingAdapter(chunks = createTextChunks('ok')): {
  runContexts: Array<RunAgentInputContext>
  adapter: ConnectConnectionAdapter
} {
  const runContexts: Array<RunAgentInputContext> = []
  return {
    runContexts,
    adapter: {
      async *connect(_messages, _data, abortSignal, runContext) {
        if (runContext) {
          runContexts.push(runContext)
        }
        for (const chunk of chunks) {
          if (abortSignal?.aborted) {
            return
          }
          yield chunk
        }
      },
    },
  }
}

describe('ChatClient identity', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not call crypto.randomUUID or Math.random in the constructor', () => {
    const randomUUID = vi.fn(() => {
      throw new Error('crypto.randomUUID during construct')
    })
    vi.stubGlobal('crypto', { randomUUID })
    const mathRandom = vi.spyOn(Math, 'random')

    expect(() => {
      new ChatClient({
        connection: createCapturingAdapter().adapter,
      })
    }).not.toThrow()

    expect(randomUUID).not.toHaveBeenCalled()
    expect(mathRandom).not.toHaveBeenCalled()
  })

  it('mints a thread id on first send when none is provided, and reuses it', async () => {
    const { adapter, runContexts } = createCapturingAdapter()
    const client = new ChatClient({ connection: adapter })

    await client.sendMessage('first')
    await client.sendMessage('second')

    expect(runContexts).toHaveLength(2)
    expect(runContexts[0]?.threadId).toMatch(/^thread-/)
    expect(runContexts[1]?.threadId).toBe(runContexts[0]?.threadId)
  })

  it('uses the provided threadId on the wire', async () => {
    const { adapter, runContexts } = createCapturingAdapter()
    const client = new ChatClient({
      connection: adapter,
      threadId: 'support-42',
    })

    await client.sendMessage('hello')

    expect(runContexts[0]?.threadId).toBe('support-42')
  })

  it('throws when persistence is set without a threadId', () => {
    expect(() => {
      // @ts-expect-error threadId is required whenever persistence is on
      new ChatClient({
        connection: createCapturingAdapter().adapter,
        persistence: createMockPersistence(),
      })
    }).toThrow(/persistence needs a stable `threadId`/)
  })

  it('throws when persistence: true is set without a threadId', () => {
    expect(() => {
      // @ts-expect-error threadId is required whenever persistence is on
      new ChatClient({
        connection: createCapturingAdapter().adapter,
        persistence: true,
      })
    }).toThrow(/persistence needs a stable `threadId`/)
  })
})
