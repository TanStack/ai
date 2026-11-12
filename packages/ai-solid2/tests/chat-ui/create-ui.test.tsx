import { createSignal, flush, onCleanup } from 'solid-js'
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
  document.body.append(container)
  const dispose = render(node, container)
  disposers.push(() => {
    dispose()
    container.remove()
  })
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

  it.each(['message', 'chat'] as const)(
    'preserves stateful part renderers during immutable streaming updates via %s',
    (mode) => {
      const unchanged: MessagePart = { type: 'text', content: 'unchanged' }
      const [message, setMessage] = createSignal<UIMessage>({
        id: 'stream',
        role: 'assistant',
        parts: [unchanged, { type: 'text', content: 'first' }],
      })
      const mounted = vi.fn()
      const UI = factory()(chatOptions, {
        ...baseConfig,
        partsComponents: {
          text: (props) => {
            mounted()
            const [draft, setDraft] = createSignal('')
            const [expanded, setExpanded] = createSignal(false)
            return (
              <section>
                <span>{props.part.content}</span>
                <input
                  value={draft()}
                  onInput={(event) => setDraft(event.currentTarget.value)}
                />
                <button onClick={() => setExpanded(!expanded())}>
                  {expanded() ? 'expanded' : 'collapsed'}
                </button>
                <output>{draft()}</output>
              </section>
            )
          },
        },
      })
      const chat = { ...host([]), messages: () => [message()] } as ChatUIHost<
        typeof chatOptions
      >
      const container = mount(() =>
        mode === 'chat' ? (
          <UI.Chat chat={chat} />
        ) : (
          <UI.Provider chat={chat}>
            <UI.Message message={message()} />
          </UI.Provider>
        ),
      )
      const inputs = Array.from(container.querySelectorAll('input'))
      const buttons = Array.from(container.querySelectorAll('button'))
      inputs.forEach((input, index) => {
        input.value = `draft-${index}`
        input.dispatchEvent(new Event('input', { bubbles: true }))
        buttons[index]!.click()
      })
      inputs[0]!.focus()
      flush()
      expect(document.activeElement).toBe(inputs[0])
      expect(container.querySelectorAll('output')[1]?.textContent).toBe(
        'draft-1',
      )

      setMessage({
        id: 'stream',
        role: 'assistant',
        parts: [unchanged, { type: 'text', content: 'first streamed' }],
      })
      flush()
      expect(container.querySelectorAll('span')[1]?.textContent).toBe(
        'first streamed',
      )
      inputs.forEach((input, index) => {
        expect(container.querySelectorAll('input')[index]).toBe(input)
      })
      expect(document.activeElement).toBe(inputs[0])
      expect(mounted).toHaveBeenCalledTimes(2)
      expect(
        Array.from(
          container.querySelectorAll('output'),
          (node) => node.textContent,
        ),
      ).toEqual(['draft-0', 'draft-1'])
      expect(buttons.map((button) => button.textContent)).toEqual([
        'expanded',
        'expanded',
      ])

      setMessage((current) => ({
        ...current,
        parts: current.parts.map((part) => ({ ...part })),
      }))
      flush()
      inputs.forEach((input, index) => {
        expect(container.querySelectorAll('input')[index]).toBe(input)
      })
      expect(document.activeElement).toBe(inputs[0])
      expect(mounted).toHaveBeenCalledTimes(2)

      setMessage((current) => ({
        ...current,
        parts: [...current.parts, { type: 'text', content: 'appended' }],
      }))
      flush()
      expect(container.querySelectorAll('input')).toHaveLength(3)
      expect(container.querySelectorAll('span')[2]?.textContent).toBe(
        'appended',
      )
      inputs.forEach((input, index) => {
        expect(container.querySelectorAll('input')[index]).toBe(input)
      })
      expect(document.activeElement).toBe(inputs[0])
      expect(mounted).toHaveBeenCalledTimes(3)

      setMessage({
        id: 'different-message',
        role: 'assistant',
        parts: [{ type: 'text', content: 'new message' }],
      })
      flush()
      expect(container.querySelector('input')).not.toBe(inputs[0])
      expect(container.querySelector('input')?.value).toBe('')
      expect(container.querySelector('button')?.textContent).toBe('collapsed')
      expect(container.querySelector('span')?.textContent).toBe('new message')
    },
  )

  it('preserves each repeated ID-less part occurrence on a message-only update', () => {
    const shared: MessagePart = { type: 'text', content: 'shared' }
    const [message, setMessage] = createSignal<UIMessage>({
      id: 'repeated-parts',
      role: 'assistant',
      parts: [shared, shared],
    })
    const mounted = vi.fn()
    const cleaned = vi.fn()
    const UI = factory()(chatOptions, {
      ...baseConfig,
      partsComponents: {
        text: (props) => {
          mounted()
          onCleanup(cleaned)
          const [draft, setDraft] = createSignal('')
          return (
            <label>
              {props.part.content}
              <input
                value={draft()}
                onInput={(event) => setDraft(event.currentTarget.value)}
              />
              <output>{draft()}</output>
            </label>
          )
        },
      },
    })
    const chat = host([])
    const container = mount(() => (
      <UI.Provider chat={chat}>
        <UI.Message message={message()} />
      </UI.Provider>
    ))
    const inputs = Array.from(container.querySelectorAll('input'))
    expect(inputs).toHaveLength(2)
    inputs.forEach((input, index) => {
      input.value = `draft-${index}`
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    inputs[0]!.focus()
    flush()
    expect(document.activeElement).toBe(inputs[0])
    expect(mounted).toHaveBeenCalledTimes(2)

    setMessage((current) => ({ ...current, parts: [...current.parts] }))
    flush()
    const updatedInputs = Array.from(container.querySelectorAll('input'))
    expect.soft(updatedInputs).toHaveLength(2)
    inputs.forEach((input, index) => {
      expect.soft(updatedInputs[index]).toBe(input)
    })
    expect
      .soft(updatedInputs.map((input) => input.value))
      .toEqual(['draft-0', 'draft-1'])
    expect
      .soft(
        Array.from(
          container.querySelectorAll('output'),
          (node) => node.textContent,
        ),
      )
      .toEqual(['draft-0', 'draft-1'])
    expect.soft(document.activeElement).toBe(inputs[0])
    expect.soft(mounted).toHaveBeenCalledTimes(2)
    expect.soft(cleaned).not.toHaveBeenCalled()
  })

  it('keeps tool state with its call ID through updates, reordering, and removal', () => {
    const tool = (id: string, city: string): MessagePart => ({
      type: 'tool-call',
      id,
      name: 'getWeather',
      arguments: JSON.stringify({ city }),
      input: { city },
      state: 'input-complete',
    })
    const [message, setMessage] = createSignal<UIMessage>({
      id: 'tools',
      role: 'assistant',
      parts: [tool('a', 'Paris'), tool('b', 'London')],
    })
    const mounted = vi.fn()
    const UI = factory()(chatOptions, {
      ...baseConfig,
      toolsComponents: {
        ...baseConfig.toolsComponents,
        getWeather: (props) => {
          mounted()
          const [draft, setDraft] = createSignal('')
          return (
            <section data-call={props.part.id}>
              <span>{props.part.input?.city}</span>
              <output>{props.result?.content as string}</output>
              <input
                value={draft()}
                onInput={(event) => setDraft(event.currentTarget.value)}
              />
            </section>
          )
        },
      },
    })
    const chat = host([])
    const container = mount(() => (
      <UI.Provider chat={chat}>
        <UI.Message message={message()} />
      </UI.Provider>
    ))
    const a = container.querySelector('[data-call="a"]')!
    const b = container.querySelector('[data-call="b"]')!
    const input = a.querySelector('input')!
    input.value = 'Paris draft'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flush()

    setMessage({
      id: 'tools',
      role: 'assistant',
      parts: [
        tool('b', 'London updated'),
        tool('a', 'Paris updated'),
        {
          type: 'tool-result',
          toolCallId: 'a',
          content: 'sunny',
          state: 'complete',
        },
      ],
    })
    flush()
    expect(container.querySelector('[data-call="a"]')).toBe(a)
    expect(container.querySelector('[data-call="b"]')).toBe(b)
    expect(
      Array.from(container.querySelectorAll('[data-call]'), (node) =>
        node.getAttribute('data-call'),
      ),
    ).toEqual(['b', 'a'])
    expect(a.querySelector('span')?.textContent).toBe('Paris updated')
    expect(b.querySelector('span')?.textContent).toBe('London updated')
    expect(a.querySelector('output')?.textContent).toBe('sunny')
    expect(a.querySelector('input')?.value).toBe('Paris draft')
    expect(mounted).toHaveBeenCalledTimes(2)

    setMessage({
      id: 'tools',
      role: 'assistant',
      parts: [tool('a', 'Paris final')],
    })
    flush()
    expect(container.querySelector('[data-call="a"]')).toBe(a)
    expect(container.querySelector('[data-call="b"]')).toBeNull()
    expect(b.isConnected).toBe(false)
    expect(a.querySelector('span')?.textContent).toBe('Paris final')
    expect(a.querySelector('output')?.textContent).toBe('')
    expect(a.querySelector('input')?.value).toBe('Paris draft')
    expect(mounted).toHaveBeenCalledTimes(2)
  })

  it('moves and removes existing ID-less parts without reassigning their state', () => {
    const first: MessagePart = { type: 'text', content: 'first' }
    const second: MessagePart = { type: 'text', content: 'second' }
    const [message, setMessage] = createSignal<UIMessage>({
      id: 'text-order',
      role: 'assistant',
      parts: [first, second],
    })
    const UI = factory()(chatOptions, {
      ...baseConfig,
      partsComponents: {
        text: (props) => (
          <label>
            {props.part.content}
            <input />
          </label>
        ),
      },
    })
    const chat = host([])
    const container = mount(() => (
      <UI.Provider chat={chat}>
        <UI.Message message={message()} />
      </UI.Provider>
    ))
    const labels = Array.from(container.querySelectorAll('label'))
    labels[0]!.querySelector('input')!.value = 'first draft'
    labels[1]!.querySelector('input')!.value = 'second draft'
    setMessage({ id: 'text-order', role: 'assistant', parts: [second, first] })
    flush()
    expect(container.querySelectorAll('label')[0]).toBe(labels[1])
    expect(container.querySelectorAll('label')[1]).toBe(labels[0])
    setMessage({ id: 'text-order', role: 'assistant', parts: [first] })
    flush()
    expect(container.querySelector('label')).toBe(labels[0])
    expect(container.querySelector('input')?.value).toBe('first draft')
    expect(labels[1]!.isConnected).toBe(false)
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
