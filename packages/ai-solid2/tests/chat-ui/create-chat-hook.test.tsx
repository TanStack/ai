import { createSignal, flush } from 'solid-js'
import { render } from '@solidjs/web'
import { renderHook } from '@solidjs/testing-library'
import { ChatClient } from '@tanstack/ai-client'
import { afterEach, expect, it, vi } from 'vitest'
import {
  createMockConnectionAdapter,
  createPushableSubscribeConnection,
  createTextChunks,
} from '../../../ai-client/tests/test-utils'
import {
  chatOptions,
  messageWithToolResults,
} from '../../../ai-client/tests/ui-fixtures'

import * as module from '../../src/ui'
const disposers: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  vi.restoreAllMocks()
})

it('exports the UI subpath and binds AppChat to a real chat instance', () => {
  expect(module?.createChatHook).toBeTypeOf('function')
  expect(module?.createChatUI).toBeTypeOf('function')
  expect(module?.createChatHookContexts).toBeTypeOf('function')
  expect(module?.TextPart).toBeTypeOf('function')
  expect(module?.ThinkingPart).toBeTypeOf('function')
  const { useAppChat, useChatContext } = module!.createChatHook({
    options: chatOptions,
    components: {
      layout: (props) => <props.Messages />,
      message: (props) => (
        <article>
          <props.Parts />
        </article>
      ),
    },
    partsComponents: { fallback: (props) => <span>{props.part.type}</span> },
    toolsComponents: {
      getWeather: (props) => <strong>{props.part.input?.city}</strong>,
      purchaseItem: () => null,
    },
    interruptsComponents: { generic: { choosePlan: () => null } },
  })
  expect(useChatContext).toBeTypeOf('function')
  const container = document.createElement('div')
  disposers.push(
    render(() => {
      const chat = useAppChat({
        threadId: 'ui-hook',
        initialMessages: [messageWithToolResults] as never,
      })
      return <chat.AppChat />
    }, container),
  )
  flush()
  expect(container.innerHTML).toContain('<strong>Paris</strong>')
})

it('replaces the client and discards old messages when the threadId getter changes', async () => {
  const attach = vi.spyOn(ChatClient.prototype, 'attach')
  const detach = vi.spyOn(ChatClient.prototype, 'detach')
  const dispose = vi.spyOn(ChatClient.prototype, 'dispose')
  const { useAppChat } = module.createChatHook({
    options: {
      connection: createMockConnectionAdapter({
        chunks: createTextChunks('Response'),
      }),
    },
    components: {
      layout: (props) => <props.Messages />,
      message: (props) => <props.Parts />,
    },
    partsComponents: { text: (props) => <span>{props.part.content}</span> },
  })
  const rendered = renderHook(() => {
    const [threadId, setThreadId] = createSignal('first-thread')
    return {
      chat: useAppChat({
        get threadId() {
          return threadId()
        },
      }),
      setThreadId,
    }
  })
  disposers.push(rendered.cleanup)
  const { chat, setThreadId } = rendered.result
  const container = document.createElement('div')
  disposers.push(render(() => <chat.AppChat />, container))
  flush()
  expect(attach).toHaveBeenCalledTimes(1)
  const first = attach.mock.instances[0]
  await chat.sendMessage('First question')
  flush()
  expect(container.textContent).toContain('First question')

  setThreadId('second-thread')
  flush()

  expect.soft(chat.messages()).toEqual([])
  expect.soft(container.textContent).toBe('')
  expect.soft(detach.mock.instances).toEqual([first])
  expect.soft(dispose.mock.instances).toEqual([first])
  expect.soft(attach).toHaveBeenCalledTimes(2)
  await chat.sendMessage('Second question')
  flush()
  expect(container.textContent).toContain('Second question')
  expect(container.textContent).not.toContain('First question')
  expect(
    chat.messages().filter((message) => message.role === 'user'),
  ).toHaveLength(1)
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
    const { useAppChat } = module.createChatHook({
      options: {
        connection,
        get forwardedProps() {
          return source === 'factory'
            ? reactiveOptions.forwardedProps
            : { provider: 'factory' }
        },
      },
      components: {
        layout: (props) => <props.Messages />,
        message: (props) => <props.Parts />,
      },
      partsComponents: { text: (props) => <span>{props.part.content}</span> },
    })
    const rendered = renderHook(() =>
      useAppChat(
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
    const chat = rendered.result
    const AppChat = chat.AppChat
    const container = document.createElement('div')
    disposers.push(render(() => <chat.AppChat />, container))
    flush()
    await chat.sendMessage('First')
    flush()
    const transcript = chat.messages()

    setProvider('anthropic')
    flush()

    expect(chat.messages()).toBe(transcript)
    expect(container.textContent).toContain('First')
    expect(chat.AppChat).toBe(AppChat)
    expect(attach).toHaveBeenCalledTimes(1)
    expect(dispose).not.toHaveBeenCalled()
    await chat.sendMessage('Second')
    flush()
    expect(requests).toEqual([
      { users: 1, provider: 'openai' },
      { users: 2, provider: 'anthropic' },
    ])
    expect(container.textContent).toContain('First')
    expect(container.textContent).toContain('Second')
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
  const { useAppChat } = module.createChatHook({
    options: { connection },
    components: { layout: () => null, message: () => null },
    partsComponents: {},
  })
  const rendered = renderHook(() => {
    const [live, setLive] = createSignal(false)
    return {
      chat: useAppChat({
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
