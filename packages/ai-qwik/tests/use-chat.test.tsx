import { createDOM } from '@qwik.dev/core/testing'
import { $, component$, useSignal } from '@qwik.dev/core'
import { describe, expect, test } from 'vitest'
import { useChat } from '../src'
import type { UIMessage } from '../src'
import type { StreamChunk } from '@tanstack/ai'

declare global {
  // eslint-disable-next-line no-var -- global test sink used from QRL callbacks
  var __aiQwikTestEvents: Array<string> | undefined
  // eslint-disable-next-line no-var -- controls a QRL factory without capturing non-serializable test state
  var __aiQwikFailInitialization: boolean | undefined
}

export function pushQwikTestEvent(value: string): void {
  globalThis.__aiQwikTestEvents?.push(value)
}

export function createQwikTestChunks(text = 'ok'): Array<StreamChunk> {
  return [
    {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: `message-${text}`,
      model: 'test',
      timestamp: Date.now(),
      delta: text,
      content: text,
    },
    {
      type: 'RUN_FINISHED',
      runId: `run-${text}`,
      threadId: `thread-${text}`,
      model: 'test',
      timestamp: Date.now(),
      finishReason: 'stop',
    },
  ] as Array<StreamChunk>
}

export function createQwikTestPersistence() {
  return {
    getItem(id: string) {
      pushQwikTestEvent(`persistence:get:${id}`)
      return initialMessages
    },
    setItem() {
      pushQwikTestEvent('persistence:set')
    },
    removeItem() {
      pushQwikTestEvent('persistence:remove')
    },
  }
}

export function createQwikTestStreamProcessor() {
  return {
    chunkStrategy: {
      shouldEmit() {
        pushQwikTestEvent('strategy:emit')
        return true
      },
      reset() {
        pushQwikTestEvent('strategy:reset')
      },
    },
  }
}

function createSseResponse(chunks: Array<StreamChunk>): Response {
  return new Response(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(''),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    },
  )
}

const initialMessages: Array<UIMessage> = [
  {
    id: 'message-1',
    role: 'assistant',
    parts: [{ type: 'text', content: 'Initial chat message' }],
  },
]

const ChatHarness = component$(() => {
  const chat = useChat({
    api: '/api/chat',
    initialMessages,
  })

  return (
    <section data-testid="ai-qwik-chat">
      <p>Status {chat.status.value}</p>
      {chat.messages.value.map((message) => (
        <article key={message.id}>
          {message.parts.map((part, index) =>
            part.type === 'text' ? (
              <p key={`${message.id}-${index}`}>{part.content}</p>
            ) : null,
          )}
        </article>
      ))}
    </section>
  )
})

describe('@tanstack/ai-qwik useChat', () => {
  test('renders initial messages inside a Qwik component', async () => {
    const { screen, render } = await createDOM()

    await render(<ChatHarness />)

    expect(screen.outerHTML).toContain('Status ready')
    expect(screen.outerHTML).toContain('Initial chat message')
  })

  test('sends the latest forwarded props after option changes', async () => {
    const originalFetch = globalThis.fetch
    const requestBodies: Array<any> = []

    globalThis.fetch = async (_, init) => {
      requestBodies.push(JSON.parse(String(init?.body)))
      return new Response('', {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
        },
      })
    }

    const DynamicOptionsHarness = component$(() => {
      const model = useSignal('initial-model')
      const chat = useChat({
        api: '/api/chat',
        forwardedProps: {
          model: model.value,
        },
      })

      const send = $(async () => {
        await chat.sendMessage('hello')
      })

      return (
        <section>
          <p>Model {model.value}</p>
          <button
            type="button"
            onClick$={() => {
              model.value = 'updated-model'
            }}
          >
            Change model
          </button>
          <button type="button" onClick$={send}>
            Send
          </button>
        </section>
      )
    })

    try {
      const { render, screen, userEvent } = await createDOM()

      await render(<DynamicOptionsHarness />)
      const buttons = screen.querySelectorAll('button')

      await userEvent(buttons[0]!, 'click')
      expect(screen.outerHTML).toContain('updated-model')
      await userEvent(buttons[1]!, 'click')

      expect(requestBodies).toHaveLength(1)
      expect(requestBodies[0]?.forwardedProps?.model).toBe('updated-model')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('calls the latest QRL chunk callback after option changes', async () => {
    const originalFetch = globalThis.fetch
    globalThis.__aiQwikTestEvents = []

    globalThis.fetch = async () => createSseResponse(createQwikTestChunks())

    const DynamicCallbackHarness = component$(() => {
      const useUpdatedCallback = useSignal(false)
      const initialChunk$ = $(() => {
        pushQwikTestEvent('initial')
      })
      const updatedChunk$ = $(() => {
        pushQwikTestEvent('updated')
      })
      const chat = useChat({
        api: '/api/chat',
        onChunk$: useUpdatedCallback.value ? updatedChunk$ : initialChunk$,
      })

      const send = $(async () => {
        await chat.sendMessage('hello')
      })

      return (
        <section>
          <p>Updated {String(useUpdatedCallback.value)}</p>
          <button
            type="button"
            onClick$={() => {
              useUpdatedCallback.value = true
            }}
          >
            Use updated callback
          </button>
          <button type="button" onClick$={send}>
            Send
          </button>
        </section>
      )
    })

    try {
      const { render, screen, userEvent } = await createDOM()

      await render(<DynamicCallbackHarness />)
      const buttons = screen.querySelectorAll('button')

      await userEvent(buttons[0]!, 'click')
      expect(screen.outerHTML).toContain('Updated true')
      globalThis.__aiQwikTestEvents = []
      await userEvent(buttons[1]!, 'click')

      expect(globalThis.__aiQwikTestEvents).toContain('updated')
      expect(globalThis.__aiQwikTestEvents).not.toContain('initial')
    } finally {
      globalThis.fetch = originalFetch
      globalThis.__aiQwikTestEvents = undefined
    }
  })

  test('creates a runtime connection from connection$', async () => {
    globalThis.__aiQwikTestEvents = []

    const ConnectionFactoryHarness = component$(() => {
      const chat = useChat({
        forwardedProps: {
          model: 'factory-model',
        },
        connection$: $(() => ({
          async *connect(_messages: unknown, data?: Record<string, unknown>) {
            pushQwikTestEvent(String(data?.model))
            yield* createQwikTestChunks('factory')
          },
        })),
      })

      const send = $(async () => {
        await chat.sendMessage('hello')
      })

      return (
        <button type="button" onClick$={send}>
          Send
        </button>
      )
    })

    try {
      const { render, screen, userEvent } = await createDOM()

      await render(<ConnectionFactoryHarness />)
      expect(globalThis.__aiQwikTestEvents).toEqual([])
      await userEvent(screen.querySelector('button')!, 'click')

      expect(globalThis.__aiQwikTestEvents).toEqual(['factory-model'])
    } finally {
      globalThis.__aiQwikTestEvents = undefined
    }
  })

  test('stores callable options without invoking them during render', async () => {
    globalThis.__aiQwikTestEvents = []

    const CallableOptionsHarness = component$(() => {
      const chat = useChat({
        fetcher: async () => {
          pushQwikTestEvent('fetcher')
          return createSseResponse(createQwikTestChunks('callable'))
        },
        onChunk: () => {
          pushQwikTestEvent('callback')
        },
      })

      return (
        <button type="button" onClick$={() => chat.sendMessage('hello')}>
          Send
        </button>
      )
    })

    try {
      const { render, screen, userEvent } = await createDOM()

      await render(<CallableOptionsHarness />)
      expect(globalThis.__aiQwikTestEvents).toEqual([])

      await userEvent(screen.querySelector('button')!, 'click')

      expect(globalThis.__aiQwikTestEvents).toContain('fetcher')
      expect(globalThis.__aiQwikTestEvents).toContain('callback')
    } finally {
      globalThis.__aiQwikTestEvents = undefined
    }
  })

  test('surfaces initialization failures and retries instead of dropping a send', async () => {
    globalThis.__aiQwikTestEvents = []
    globalThis.__aiQwikFailInitialization = true

    const RetryHarness = component$(() => {
      const initializationError = useSignal('')
      const chat = useChat({
        connection$: $(() => {
          if (globalThis.__aiQwikFailInitialization) {
            throw new Error('factory failed')
          }
          return {
            async *connect() {
              pushQwikTestEvent('connected')
              yield* createQwikTestChunks('retry')
            },
          }
        }),
      })

      return (
        <section>
          <p>{chat.status.value}</p>
          <p>{chat.error.value?.message}</p>
          <p>{initializationError.value}</p>
          <button
            type="button"
            onClick$={async () => {
              try {
                await chat.sendMessage('fail')
              } catch (error) {
                initializationError.value =
                  error instanceof Error ? error.message : String(error)
              }
            }}
          >
            Fail
          </button>
          <button
            type="button"
            onClick$={async () => {
              globalThis.__aiQwikFailInitialization = false
              await chat.sendMessage('retry')
            }}
          >
            Retry
          </button>
        </section>
      )
    })

    try {
      const { render, screen, userEvent } = await createDOM()

      await render(<RetryHarness />)
      const buttons = screen.querySelectorAll('button')
      await userEvent(buttons[0]!, 'click')

      expect(screen.outerHTML).toContain('factory failed')
      expect(screen.outerHTML).toContain('error')

      await userEvent(buttons[1]!, 'click')

      expect(globalThis.__aiQwikTestEvents).toContain('connected')
      expect(screen.outerHTML).toContain('ready')
    } finally {
      globalThis.__aiQwikTestEvents = undefined
      globalThis.__aiQwikFailInitialization = undefined
    }
  })

  test('creates persistence and chunk strategies from resumable factories', async () => {
    globalThis.__aiQwikTestEvents = []

    const FactoryOptionsHarness = component$(() => {
      const chat = useChat({
        id: 'factory-options',
        connection$: $(() => ({
          async *connect() {
            yield* createQwikTestChunks('factory-options')
          },
        })),
        persistence$: $(() => createQwikTestPersistence()),
        streamProcessor$: $(() => createQwikTestStreamProcessor()),
      })

      return (
        <section>
          {chat.messages.value.map((message) => (
            <p key={message.id}>
              {message.parts.map((part) =>
                part.type === 'text' ? part.content : '',
              )}
            </p>
          ))}
          <button
            type="button"
            onClick$={() => chat.sendMessage('factory options')}
          >
            Send
          </button>
        </section>
      )
    })

    try {
      const { render, screen, userEvent } = await createDOM()

      await render(<FactoryOptionsHarness />)
      await userEvent(screen.querySelector('button')!, 'click')

      expect(screen.outerHTML).toContain('Initial chat message')
      expect(globalThis.__aiQwikTestEvents).toContain(
        'persistence:get:factory-options',
      )

      expect(globalThis.__aiQwikTestEvents).toContain('strategy:reset')
      expect(globalThis.__aiQwikTestEvents).toContain('strategy:emit')
      expect(globalThis.__aiQwikTestEvents).toContain('persistence:set')
    } finally {
      globalThis.__aiQwikTestEvents = undefined
    }
  })
})
