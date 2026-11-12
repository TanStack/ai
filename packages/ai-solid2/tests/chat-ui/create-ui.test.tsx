import { createSignal, flush } from 'solid-js'
import { render } from '@solidjs/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ChatUIFactoryConfig,
  ChatUIHost,
} from '../../src/chat-ui/create-ui'
import {
  chatOptions,
  createSolidChatResult,
  genericInterrupt,
  messageWithToolResults,
  purchaseApprovalInterrupt,
  purchaseApprovalMessage,
  unknownToolMessage,
  unboundInterrupt,
} from '../../../ai-client/tests/ui-fixtures'
import type { MessagePart, UIMessage } from '@tanstack/ai-client'
import type { ChatUIInterrupt } from '@tanstack/ai-client/ui'

import * as module from '../../src/chat-ui/create-ui'
const disposers: Array<() => void> = []
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose())
  vi.restoreAllMocks()
})
function factory() {
  expect(module?.createChatUI).toBeTypeOf('function')
  return module!.createChatUI
}
function host(
  ...args: Parameters<typeof createSolidChatResult>
): ChatUIHost<typeof chatOptions> {
  return createSolidChatResult(...args) as unknown as ChatUIHost<
    typeof chatOptions
  >
}
function mount(node: Parameters<typeof render>[0]) {
  const container = document.createElement('div')
  disposers.push(render(node, container))
  flush()
  return container
}
const baseConfig: ChatUIFactoryConfig<typeof chatOptions> = {
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
  interruptsComponents: {
    generic: { choosePlan: () => null, fallback: () => null },
  },
}

describe('Solid 2 createChatUI', () => {
  it('switches the provided chat instance without retaining old accessors', () => {
    const [chat, setChat] = createSignal(
      host([
        {
          id: 'one',
          role: 'assistant',
          parts: [{ type: 'text', content: 'first chat' }],
        },
      ]),
    )
    const UI = factory()(chatOptions, {
      ...baseConfig,
      partsComponents: { text: (props) => <span>{props.part.content}</span> },
    })
    const container = mount(() => <UI.Chat chat={chat()} />)
    expect(container.textContent).toBe('first chat')
    setChat(
      host([
        {
          id: 'two',
          role: 'assistant',
          parts: [{ type: 'text', content: 'second chat' }],
        },
      ]),
    )
    flush()
    expect(container.textContent).toBe('second chat')
  })

  it('tracks message replacement in automatic and manual part traversal', () => {
    const [message, setMessage] = createSignal<UIMessage>({
      id: 'stream',
      role: 'assistant',
      parts: [{ type: 'text', content: 'first' }],
    })
    const UI = factory()(chatOptions, {
      ...baseConfig,
      partsComponents: { text: (props) => <span>{props.part.content}</span> },
    })
    const chat = host([])
    const container = mount(() => (
      <UI.Provider chat={chat}>
        <section data-mode="auto">
          <UI.Message message={message()} />
        </section>
        <section data-mode="manual">
          <UI.Message message={message()}>
            {(parts) => (
              <span>
                {parts
                  .map((selected) =>
                    selected.part.type === 'text' ? selected.part.content : '',
                  )
                  .join('')}
              </span>
            )}
          </UI.Message>
        </section>
      </UI.Provider>
    ))
    expect(container.querySelector('[data-mode="auto"]')?.textContent).toBe(
      'first',
    )
    expect(container.querySelector('[data-mode="manual"]')?.textContent).toBe(
      'first',
    )
    setMessage({
      id: 'stream',
      role: 'assistant',
      parts: [{ type: 'text', content: 'second' }],
    })
    flush()
    expect(container.querySelector('[data-mode="auto"]')?.textContent).toBe(
      'second',
    )
    expect(container.querySelector('[data-mode="manual"]')?.textContent).toBe(
      'second',
    )
  })

  it('tracks standalone part content and switches renderer when its type changes', () => {
    const [part, setPart] = createSignal<MessagePart>({
      type: 'text',
      content: 'first',
    })
    const UI = factory()(chatOptions, {
      ...baseConfig,
      partsComponents: {
        text: (props) => <span>{props.part.content}</span>,
        thinking: (props) => <em>{props.part.content}</em>,
      },
    })
    const container = mount(() => (
      <UI.Provider chat={host([])}>
        <UI.Part part={part()} />{' '}
        <UI.Part part={part()}>{(mixed) => <mixed.Render />}</UI.Part>
      </UI.Provider>
    ))
    expect(container.textContent).toContain('first')
    setPart({ type: 'thinking', content: 'reasoning' })
    flush()
    expect(container.querySelectorAll('em')).toHaveLength(2)
    expect(container.textContent).not.toContain('first')
    expect(container.textContent).toContain('reasoning')
  })

  it('tracks interrupt component selection and bound Render mixins', () => {
    const [interrupt, setInterrupt] =
      createSignal<ChatUIInterrupt>(genericInterrupt)
    const UI = factory()(chatOptions, {
      ...baseConfig,
      interruptsComponents: {
        generic: {
          choosePlan: (props) => <strong>{props.interrupt.message}</strong>,
          fallback: (props) => <em>{props.interrupt.message}</em>,
        },
      },
    })
    const container = mount(() => (
      <UI.Interrupt interrupt={interrupt()}>
        {(mixed) => <mixed.Render />}
      </UI.Interrupt>
    ))
    expect(container.querySelector('strong')?.textContent).toBe('Choose a plan')
    setInterrupt(unboundInterrupt)
    flush()
    expect(container.querySelector('strong')).toBeNull()
    expect(container.querySelector('em')?.textContent).toBe('Owned elsewhere')
  })

  it('updates inline tool approvals without replacing the message', () => {
    const [interrupts, setInterrupts] = createSignal<Array<ChatUIInterrupt>>([])
    const chat = {
      ...host([purchaseApprovalMessage]),
      interrupts,
    } as ChatUIHost<typeof chatOptions>
    const UI = factory()(chatOptions, {
      ...baseConfig,
      toolsComponents: {
        ...baseConfig.toolsComponents,
        purchaseItem: (props) => (
          <strong>{props.interrupt?.message ?? 'waiting'}</strong>
        ),
      },
    })
    const container = mount(() => <UI.Chat chat={chat} />)
    expect(container.textContent).toBe('waiting')
    setInterrupts([purchaseApprovalInterrupt])
    flush()
    expect(container.textContent).toBe('Approve purchase')
    setInterrupts([])
    flush()
    expect(container.textContent).toBe('waiting')
  })

  it('renders automatic and manual traversal with Solid 2 contexts', () => {
    const UI = factory()(chatOptions, baseConfig)
    const chat = host([messageWithToolResults])
    expect(mount(() => <UI.Chat chat={chat} />).innerHTML).toContain(
      '<strong>Paris</strong>',
    )
    expect(
      mount(() => (
        <UI.Provider chat={chat}>
          <UI.Messages>
            {(messages) => <span>{messages().length}</span>}
          </UI.Messages>
        </UI.Provider>
      )).textContent,
    ).toBe('1')
  })

  it('warns once for a missing runtime key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const UI = factory()(chatOptions, baseConfig)
    const chat = host([unknownToolMessage])
    mount(() => <UI.Chat chat={chat} />)
    mount(() => <UI.Chat chat={chat} />)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('warns once when layout renders an unregistered Input', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const UI = factory()(chatOptions, {
      ...baseConfig,
      components: {
        ...baseConfig.components,
        layout: (props) => (
          <main>
            <props.Input />
          </main>
        ),
      },
    })
    mount(() => <UI.Chat chat={host([])} />)
    expect(mount(() => <UI.Chat chat={host([])} />).textContent).toBe('')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      'no `input` component is registered',
    )
  })

  it('reactively renders queued items and binds cancellation to click', () => {
    const cancelQueued = vi.fn()
    const [queue, setQueue] = createSignal([
      { id: 'q1', content: 'later', createdAt: 1 },
    ])
    const chat = { ...host([]), queue, cancelQueued }
    const UI = factory()(chatOptions, {
      ...baseConfig,
      components: {
        ...baseConfig.components,
        layout: (props) => <props.Queue />,
        queue: (props) => (
          <button onClick={() => props.item.cancelQueued()}>
            {typeof props.item.content === 'string' ? props.item.content : ''}
          </button>
        ),
      },
    })
    const container = mount(() => <UI.Chat chat={chat} />)
    expect(container.textContent).toBe('later')
    expect(cancelQueued).not.toHaveBeenCalled()
    container.querySelector('button')!.click()
    expect(cancelQueued).toHaveBeenCalledWith('q1')
    setQueue([{ id: 'q2', content: 'next', createdAt: 2 }])
    flush()
    expect(container.textContent).toBe('next')
    container.querySelector('button')!.click()
    expect(cancelQueued).toHaveBeenLastCalledWith('q2')
  })
})
