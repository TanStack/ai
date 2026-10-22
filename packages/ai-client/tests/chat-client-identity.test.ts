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
        threadId: 'thread-1',
        connection: createCapturingAdapter().adapter,
      })
    }).not.toThrow()

    expect(randomUUID).not.toHaveBeenCalled()
    expect(mathRandom).not.toHaveBeenCalled()
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

  it.each([
    ['empty', ''],
    ['missing', undefined],
    ['non-string', 42],
  ])('throws when threadId is %s', (_label, threadId) => {
    expect(() => {
      new ChatClient({
        connection: createCapturingAdapter().adapter,
        threadId: threadId as never,
      })
    }).toThrow('ChatClient: threadId is required (a non-empty string).')
  })

  it('throws for an empty threadId even with persistence', () => {
    expect(() => {
      new ChatClient({
        connection: createCapturingAdapter().adapter,
        persistence: createMockPersistence(),
        threadId: '',
      })
    }).toThrow('ChatClient: threadId is required (a non-empty string).')
  })
})
