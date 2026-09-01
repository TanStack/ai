import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createChatHook } from '../src/create-chat-hook'
import { createMockConnectionAdapter } from './test-utils'
import type { UIMessage } from '../src/types'

describe('createChatHook', () => {
  it('creates a chat from factory options', () => {
    const initialMessages: Array<UIMessage> = [
      {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', content: 'Hello' }],
        createdAt: new Date(),
      },
    ]
    const { useChat } = createChatHook({
      connection: createMockConnectionAdapter(),
      initialMessages,
    })

    const { result } = renderHook(() => useChat())

    expect(result.current.messages).toEqual(initialMessages)
  })

  it('merges per-call instance overrides', () => {
    const { useChat } = createChatHook({
      connection: createMockConnectionAdapter(),
      initialMessages: [
        {
          id: 'factory',
          role: 'user',
          parts: [{ type: 'text', content: 'factory' }],
          createdAt: new Date(),
        },
      ],
    })

    const overrideMessages: Array<UIMessage> = [
      {
        id: 'override',
        role: 'user',
        parts: [{ type: 'text', content: 'override' }],
        createdAt: new Date(),
      },
    ]
    const { result } = renderHook(() =>
      useChat({ initialMessages: overrideMessages, threadId: 'thread-1' }),
    )

    expect(result.current.messages).toEqual(overrideMessages)
  })
})
