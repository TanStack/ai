import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, renderHook } from '@solidjs/testing-library'
import { createSignal, flush } from 'solid-js'
import { ChatClient } from '@tanstack/ai-client'
import {
  createMockConnectionAdapter,
  createTextChunks,
} from '../../ai-client/tests/test-utils'

const disposers: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  vi.restoreAllMocks()
})

import { useChat } from '../src/use-chat'

describe('Solid 2 chat lifecycle', () => {
  it('mounts and streams a conversation with the real Solid 2 runtime', async () => {
    let chat!: ReturnType<typeof useChat>
    const mounted = render(() => {
      chat = useChat({
        threadId: 'solid2-chat',
        connection: createMockConnectionAdapter({
          chunks: createTextChunks('Hello Solid 2'),
        }),
        initialMessages: [
          {
            id: 'seed',
            role: 'user',
            parts: [{ type: 'text', content: 'Seed' }],
          },
        ],
      })
      return (
        <div>
          {chat
            .messages()
            .map((message) =>
              message.parts
                .map((part) => (part.type === 'text' ? part.content : ''))
                .join(''),
            )
            .join('|')}
        </div>
      )
    })
    disposers.push(mounted.unmount)
    expect(mounted.container.textContent).toBe('Seed')
    await chat.sendMessage('Hello')
    flush()
    expect(mounted.container.textContent).toContain('Hello Solid 2')
    expect(chat.status()).toBe('ready')
    chat.clear()
    flush()
    expect(mounted.container.textContent).toBe('')
  })

  it('disposes the captured old client on thread replacement and the current one on unmount', async () => {
    const dispose = vi.spyOn(ChatClient.prototype, 'dispose')
    const detach = vi.spyOn(ChatClient.prototype, 'detach')
    const attach = vi.spyOn(ChatClient.prototype, 'attach')
    const rendered = renderHook(() => {
      const [threadId, setThreadId] = createSignal('first')
      const chat = useChat({
        get threadId() {
          return threadId()
        },
        connection: createMockConnectionAdapter({
          chunks: createTextChunks('answer'),
        }),
      })
      return { chat, setThreadId }
    })
    flush()
    expect(attach).toHaveBeenCalledTimes(1)
    const first = attach.mock.instances[0]
    await rendered.result.chat.sendMessage('First question')
    rendered.result.setThreadId('second')
    flush()
    expect(dispose.mock.instances).toEqual([first])
    expect(detach.mock.instances).toContain(first)
    expect(attach).toHaveBeenCalledTimes(2)
    expect(rendered.result.chat.messages()).toEqual([])
    await rendered.result.chat.sendMessage('Second question')
    expect(
      rendered.result.chat
        .messages()
        .filter((message) => message.role === 'user'),
    ).toHaveLength(1)
    rendered.cleanup()
    expect(dispose.mock.instances).toEqual(attach.mock.instances)
  })

  it('catches an update between construction and the effect subscribing', () => {
    const rendered = renderHook(() => {
      const chat = useChat({
        threadId: 'early',
        connection: createMockConnectionAdapter(),
      })
      chat.setMessages([
        {
          id: 'early',
          role: 'user',
          parts: [{ type: 'text', content: 'before attach' }],
        },
      ])
      return chat
    })
    disposers.push(rendered.cleanup)
    flush()
    expect(rendered.result.messages()[0]?.id).toBe('early')
  })
})
