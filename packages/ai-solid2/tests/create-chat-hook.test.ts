import { renderHook } from '@solidjs/testing-library'
import { createSignal, flush } from 'solid-js'
import { ChatClient } from '@tanstack/ai-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPushableSubscribeConnection } from '../../ai-client/tests/test-utils'
import { createChatHook } from '../src/create-chat-hook'
import { createMockConnectionAdapter, createTextChunks } from './test-utils'
import type { UIMessage } from '../src/types'

const disposers: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  vi.restoreAllMocks()
})

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

    const chat = renderHook(() => useChat({ threadId: 'thread-1' })).result

    expect(chat.messages()).toEqual(initialMessages)
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
    const chat = renderHook(() =>
      useChat({ initialMessages: overrideMessages, threadId: 'thread-1' }),
    ).result

    expect(chat.messages()).toEqual(overrideMessages)
  })

  it('replaces the client and discards old messages when the threadId getter changes', async () => {
    const attach = vi.spyOn(ChatClient.prototype, 'attach')
    const detach = vi.spyOn(ChatClient.prototype, 'detach')
    const dispose = vi.spyOn(ChatClient.prototype, 'dispose')
    const { useChat } = createChatHook({
      connection: createMockConnectionAdapter({
        chunks: createTextChunks('Response'),
      }),
    })
    const rendered = renderHook(() => {
      const [threadId, setThreadId] = createSignal('first-thread')
      return {
        chat: useChat({
          get threadId() {
            return threadId()
          },
        }),
        setThreadId,
      }
    })
    disposers.push(rendered.cleanup)
    const { chat, setThreadId } = rendered.result
    flush()
    expect(attach).toHaveBeenCalledTimes(1)
    const first = attach.mock.instances[0]
    await chat.sendMessage('First question')
    flush()
    expect(chat.messages().some((message) => message.role === 'user')).toBe(
      true,
    )

    setThreadId('second-thread')
    flush()

    expect.soft(chat.messages()).toEqual([])
    expect.soft(detach.mock.instances).toEqual([first])
    expect.soft(dispose.mock.instances).toEqual([first])
    expect.soft(attach).toHaveBeenCalledTimes(2)
    await chat.sendMessage('Second question')
    flush()
    expect(
      chat.messages().filter((message) => message.role === 'user'),
    ).toEqual([
      expect.objectContaining({
        parts: [{ type: 'text', content: 'Second question' }],
      }),
    ])
    rendered.cleanup()
    expect(dispose.mock.instances).toEqual(attach.mock.instances)
  })

  it.each(['factory', 'override'] as const)(
    'updates the %s forwardedProps getter without replacing the session',
    async (source) => {
      const attach = vi.spyOn(ChatClient.prototype, 'attach')
      const dispose = vi.spyOn(ChatClient.prototype, 'dispose')
      const requests: Array<{ users: number; provider: unknown }> = []
      const connection = createMockConnectionAdapter({
        chunks: createTextChunks('Response'),
        onConnect: (messages, data) => {
          requests.push({
            users: messages.filter((message) => message.role === 'user').length,
            provider: data?.['provider'],
          })
        },
      })
      const [provider, setProvider] = createSignal('openai')
      const reactiveOptions = {
        get forwardedProps() {
          return { provider: provider() }
        },
      }
      const { useChat } = createChatHook({
        connection,
        get forwardedProps() {
          return source === 'factory'
            ? reactiveOptions.forwardedProps
            : { provider: 'factory' }
        },
      })
      const rendered = renderHook(() =>
        useChat(
          source === 'override'
            ? {
                threadId: 'thread-1',
                get forwardedProps() {
                  return reactiveOptions.forwardedProps
                },
              }
            : { threadId: 'thread-1' },
        ),
      )
      disposers.push(rendered.cleanup)
      flush()
      const chat = rendered.result
      await chat.sendMessage('First')
      flush()
      const transcript = chat.messages()

      setProvider('anthropic')
      flush()

      expect(chat.messages()).toBe(transcript)
      expect(attach).toHaveBeenCalledTimes(1)
      expect(dispose).not.toHaveBeenCalled()
      await chat.sendMessage('Second')
      flush()
      expect(requests).toEqual([
        { users: 1, provider: 'openai' },
        { users: 2, provider: 'anthropic' },
      ])
      expect(
        chat.messages().filter((message) => message.role === 'user'),
      ).toHaveLength(2)
    },
  )

  it('updates the live getter without replacing the client', () => {
    const attach = vi.spyOn(ChatClient.prototype, 'attach')
    const dispose = vi.spyOn(ChatClient.prototype, 'dispose')
    const { connection } = createPushableSubscribeConnection()
    const subscribe = vi.spyOn(connection, 'subscribe')
    const { useChat } = createChatHook({ connection })
    const rendered = renderHook(() => {
      const [live, setLive] = createSignal(false)
      return {
        chat: useChat({
          threadId: 'live-thread',
          get live() {
            return live()
          },
        }),
        setLive,
      }
    })
    disposers.push(rendered.cleanup)
    flush()
    expect(rendered.result.chat.isSubscribed()).toBe(false)

    rendered.result.setLive(true)
    flush()

    expect(rendered.result.chat.isSubscribed()).toBe(true)
    expect(subscribe).toHaveBeenCalledTimes(1)
    const signal = subscribe.mock.calls[0]?.[0]
    expect(signal?.aborted).toBe(false)
    rendered.result.setLive(false)
    flush()
    expect(rendered.result.chat.isSubscribed()).toBe(false)
    expect(signal?.aborted).toBe(true)
    expect(attach).toHaveBeenCalledTimes(1)
    expect(dispose).not.toHaveBeenCalled()
  })
})
