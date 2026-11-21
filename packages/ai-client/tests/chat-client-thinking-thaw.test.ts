import { expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ChatClient } from '../src/chat-client'
import { createPushableSubscribeConnection } from './test-utils'

it('does not overwrite step 1 after restoring a frozen snapshot mid-stream', async () => {
  const { connection, push } = createPushableSubscribeConnection()
  const client = new ChatClient({
    threadId: 'thread-1',
    connection,
  })

  try {
    client.subscribe()
    await vi.waitFor(() => {
      expect(client.getIsSubscribed()).toBe(true)
    })

    push(
      {
        type: EventType.RUN_STARTED,
        runId: 'run-1',
        threadId: 'thread-1',
        timestamp: 1,
      },
      {
        type: EventType.REASONING_MESSAGE_START,
        messageId: 'step-1',
        role: 'reasoning',
        timestamp: 2,
      },
      {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: 'step-1',
        delta: 'First',
        timestamp: 3,
      },
      {
        type: EventType.REASONING_MESSAGE_START,
        messageId: 'step-2',
        role: 'reasoning',
        timestamp: 4,
      },
      {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: 'step-2',
        delta: 'Second',
        timestamp: 5,
      },
    )

    await vi.waitFor(() => {
      expect(
        client
          .getMessages()
          .flatMap((message) => message.parts)
          .filter((part) => part.type === 'thinking'),
      ).toHaveLength(2)
    })

    client.setMessagesManually(client.getSnapshot().messages)

    push({
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'step-2',
      delta: ' more',
      timestamp: 6,
    })

    await vi.waitFor(() => {
      expect(
        client
          .getMessages()
          .flatMap((message) => message.parts)
          .filter((part) => part.type === 'thinking'),
      ).toEqual([
        { type: 'thinking', content: 'First' },
        { type: 'thinking', content: 'Second more' },
      ])
    })
  } finally {
    client.unsubscribe()
    client.dispose()
  }
})
