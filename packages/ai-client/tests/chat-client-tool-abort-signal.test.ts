import { describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import { createToolCallChunks } from './test-utils'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'

describe('client tool abortSignal', () => {
  function setup() {
    const signals: Array<AbortSignal | undefined> = []
    let call = 0
    const adapter: ConnectConnectionAdapter = {
      async *connect() {
        call++
        yield* createToolCallChunks([
          { id: `tc-${call}`, name: 'slow_tool', arguments: '{}' },
        ])
      },
    }
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: adapter,
      tools: [
        {
          __toolSide: 'client' as const,
          name: 'slow_tool',
          description: 'Waits until it is cancelled',
          execute: (
            _input: unknown,
            context?: { abortSignal?: AbortSignal },
          ) => {
            const signal = context?.abortSignal
            signals.push(signal)
            return new Promise((_, reject) => {
              signal?.addEventListener('abort', () => reject(signal.reason), {
                once: true,
              })
            })
          },
        },
      ],
    })
    return { client, signals }
  }

  it('aborts the signal of a running client tool on stop()', async () => {
    const { client, signals } = setup()
    void client.sendMessage('go')
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    expect(signals[0]?.aborted).toBe(false)
    client.stop()
    expect(signals[0]?.aborted).toBe(true)
  })

  it('gives a later tool call a fresh signal after stop()', async () => {
    const { client, signals } = setup()
    void client.sendMessage('go')
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    client.stop()
    void client.sendMessage('again')
    await vi.waitFor(() => expect(signals).toHaveLength(2))
    expect(signals[1]?.aborted).toBe(false)
    client.stop()
  })
})
