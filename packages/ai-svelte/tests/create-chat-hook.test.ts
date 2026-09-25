import { describe, expect, it } from 'vitest'
import { createChatHook } from '../src/create-chat-hook'
import { createMockConnectionAdapter } from './test-utils'

describe('createChatHook', () => {
  it('creates a chat from factory options', () => {
    const initialMessages = [
      {
        id: 'msg-1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, content: 'Hello' }],
        createdAt: new Date(),
      },
    ]
    const { createChat } = createChatHook({
      connection: createMockConnectionAdapter(),
      initialMessages,
    })

    const chat = createChat()

    expect(chat.messages).toEqual(initialMessages)
  })

  it('merges per-call instance overrides', () => {
    const { createChat } = createChatHook({
      connection: createMockConnectionAdapter(),
      initialMessages: [
        {
          id: 'factory',
          role: 'user' as const,
          parts: [{ type: 'text' as const, content: 'factory' }],
          createdAt: new Date(),
        },
      ],
    })

    const overrideMessages = [
      {
        id: 'override',
        role: 'user' as const,
        parts: [{ type: 'text' as const, content: 'override' }],
        createdAt: new Date(),
      },
    ]
    const chat = createChat({
      initialMessages: overrideMessages,
      threadId: 'thread-1',
    })

    expect(chat.messages).toEqual(overrideMessages)
  })
})
