import { describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import { createMockConnectionAdapter, createTextChunks } from './test-utils'
import type { ModelMessage } from '@tanstack/ai/client'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'
import type { UIMessage } from '../src/types'

const metadata = { author: { id: 'user-42', name: 'Dana' } }

/**
 * First `connect()` waits on `release()`. Later connects (queue drain) finish
 * immediately with a unique assistant message id.
 */
function createSequencedHoldingConnection(): {
  connection: ConnectConnectionAdapter
  release: () => void
} {
  let resolveGate!: () => void
  const gate = new Promise<void>((resolve) => {
    resolveGate = resolve
  })
  let call = 0
  const connection: ConnectConnectionAdapter = {
    async *connect() {
      call += 1
      if (call === 1) {
        await gate
      }
      yield* createTextChunks('done', `msg-${call}`)
    },
  }
  return { connection, release: () => resolveGate() }
}

describe('ChatClient metadata', () => {
  it('sendMessage object form stamps metadata on the user UIMessage', async () => {
    let sentMessages: Array<ModelMessage> | Array<UIMessage> = []
    const adapter = createMockConnectionAdapter({
      chunks: createTextChunks('ok'),
      onConnect: (messages) => {
        sentMessages = messages
      },
    })
    const client = new ChatClient({ connection: adapter })

    await client.sendMessage({
      content: 'Show me failed logins',
      metadata,
    })

    const user = client.getMessages().find((m) => m.role === 'user')
    expect(user?.metadata).toEqual(metadata)

    const sentUser = sentMessages.find((m) => m.role === 'user')
    expect(sentUser).toEqual(
      expect.objectContaining({
        role: 'user',
        metadata,
      }),
    )
  })

  it('sendMessage string form has no metadata', async () => {
    const adapter = createMockConnectionAdapter({
      chunks: createTextChunks('ok'),
    })
    const client = new ChatClient({ connection: adapter })

    await client.sendMessage('hello')

    const user = client.getMessages().find((m) => m.role === 'user')
    expect(user?.metadata).toBeUndefined()
  })

  it('queued object send keeps metadata on the queue entry content', async () => {
    const { connection, release } = createSequencedHoldingConnection()
    const client = new ChatClient({ connection })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage({
      content: 'second',
      metadata,
    })

    const queued = client.getQueue()
    expect(queued).toHaveLength(1)
    expect(queued[0]?.content).toEqual({
      content: 'second',
      metadata,
    })

    release()
    await firstSend

    const users = client.getMessages().filter((m) => m.role === 'user')
    expect(users[1]?.metadata).toEqual(metadata)
  })

  it('append copies uiMessage.metadata', async () => {
    const adapter = createMockConnectionAdapter({
      chunks: createTextChunks('ok'),
    })
    const client = new ChatClient({ connection: adapter })

    const message: UIMessage = {
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', content: 'Hello' }],
      createdAt: new Date(),
      metadata,
    }

    await client.append(message)

    expect(client.getMessages()[0]?.metadata).toEqual(metadata)
  })

  it('batch drain merges object metadata last-write-wins per key', async () => {
    const { connection, release } = createSequencedHoldingConnection()
    const client = new ChatClient({
      connection,
      queue: { drain: 'batch' },
    })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage({
      content: 'a',
      metadata: { author: { id: 'user-1', name: 'Ada' }, room: 'ops' },
    })
    await client.sendMessage({
      content: 'b',
      metadata: { author: { id: 'user-42', name: 'Dana' } },
    })

    release()
    await firstSend

    const users = client.getMessages().filter((m) => m.role === 'user')
    expect(users).toHaveLength(2)
    expect(users[1]?.metadata).toEqual({
      author: { id: 'user-42', name: 'Dana' },
      room: 'ops',
    })
  })
})
