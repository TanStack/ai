import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import type { JSX } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import type { UIMessage } from '@tanstack/ai-client'
import { createChatUI } from '../../src/chat-ui/create-ui'
import { createChatHook } from '../../src/chat-ui/create-chat-hook'
import type {
  ChatUIFactoryConfig,
  ChatUIHost,
} from '../../src/chat-ui/create-ui'
import {
  chatOptions,
  createSolidChatResult,
  messageWithToolResults,
  unknownToolMessage,
} from '../../../ai-client/tests/ui-fixtures'

function host(
  ...args: Parameters<typeof createSolidChatResult>
): ChatUIHost<typeof chatOptions> {
  return createSolidChatResult(...args) as unknown as ChatUIHost<
    typeof chatOptions
  >
}

function renderHtml(node: () => unknown) {
  const container = document.createElement('div')
  render(node as () => JSX.Element, container)
  return container.innerHTML
}

const baseConfig: ChatUIFactoryConfig<typeof chatOptions> = {
  components: {
    layout: (props) => <>{<props.Messages />}</>,
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

const activityConfig: ChatUIFactoryConfig<typeof chatOptions> = {
  ...baseConfig,
  partsComponents: {
    ...baseConfig.partsComponents,
    activity: (props) => <i>{props.part.activityType}</i>,
  },
  activitiesComponents: {
    'sandbox.status': (props) => <b>{props.part.content.status}</b>,
  },
}

function activityMessage(
  activityType: string,
  content: Record<string, unknown>,
): UIMessage {
  return {
    id: `activity-${activityType}`,
    role: 'activity',
    parts: [{ type: 'activity', activityType, content }],
  }
}

describe('Solid createChatHook', () => {
  it('mixes AppChat onto the instance from options and chatComponents', () => {
    const { useAppChat, useChatContext } = createChatHook({
      options: chatOptions,
      ...baseConfig,
    })
    expect(typeof useAppChat).toBe('function')
    expect(typeof useChatContext).toBe('function')
    expect(
      renderHtml(() => {
        const chat = useAppChat({
          threadId: 'thread-1',
          initialMessages: [messageWithToolResults] as never,
        })
        return <chat.AppChat />
      }),
    ).toContain('<strong>Paris</strong>')
  })
})

describe('Solid createChatUI', () => {
  it('warns once when layout renders an Input that was never registered', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const UI = createChatUI(chatOptions, {
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
    // Twice: the warning is once per kit, not once per render.
    renderHtml(() => <UI.Chat chat={host([])} />)
    expect(renderHtml(() => <UI.Chat chat={host([])} />)).toBe('<main></main>')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      'no `input` component is registered',
    )
    warn.mockRestore()
  })

  it('renders automatic and manual traversal', () => {
    const UI = createChatUI(chatOptions, baseConfig)
    const chat = host([messageWithToolResults])

    expect(renderHtml(() => <UI.Chat chat={chat} />)).toContain(
      '<strong>Paris</strong>',
    )
    expect(
      renderHtml(() => (
        <UI.Provider chat={chat}>
          <UI.Messages>
            {(messages) => <span>{messages().length}</span>}
          </UI.Messages>
        </UI.Provider>
      )),
    ).toContain('<span>1</span>')
  })

  it('warns once for a missing runtime key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const UI = createChatUI(chatOptions, baseConfig)
    const chat = host([unknownToolMessage])
    renderHtml(() => <UI.Chat chat={chat} />)
    renderHtml(() => <UI.Chat chat={chat} />)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('renders each queued item and binds cancelQueued', () => {
    const cancelled: Array<string> = []
    const UI = createChatUI(chatOptions, {
      ...baseConfig,
      components: {
        ...baseConfig.components,
        layout: (props) => <props.Queue />,
        queue: (props) => {
          props.item.cancelQueued()
          return (
            <em>
              {typeof props.item.content === 'string' ? props.item.content : ''}
            </em>
          )
        },
      },
    })
    const chat = host([], [], {
      queue: [{ id: 'q1', content: 'later', createdAt: 1 }],
      cancelQueued: (id) => {
        cancelled.push(id)
      },
    })
    expect(renderHtml(() => <UI.Chat chat={chat} />)).toContain(
      '<em>later</em>',
    )
    expect(cancelled).toEqual(['q1'])
  })

  it('reactively updates an inline tool interrupt without remounting the tool component', () => {
    let mounts = 0
    const UI = createChatUI(chatOptions, {
      ...baseConfig,
      toolsComponents: {
        ...baseConfig.toolsComponents,
        purchaseItem: (props) => {
          mounts += 1
          return (
            <div data-status={props.interrupt?.status ?? 'none'}>
              {props.interrupt ? `approve:${props.interrupt.id}` : 'idle'}
            </div>
          )
        },
      },
    })

    const [interrupts, setInterrupts] = createSignal<Array<any>>([])
    const message = {
      id: 'm-inline',
      role: 'assistant',
      parts: [
        {
          type: 'tool-call',
          id: 'tc-buy',
          name: 'purchaseItem',
          arguments: '{"sku":"A1"}',
          input: { sku: 'A1' },
          state: 'approval-requested',
        },
      ],
    }
    const base = host([message as any], [])
    const reactiveChat = {
      ...base,
      interrupts,
    } as ChatUIHost<typeof chatOptions>

    const container = document.createElement('div')
    const dispose = render(() => <UI.Chat chat={reactiveChat} />, container)
    try {
      expect(container.innerHTML).toContain('idle')
      expect(mounts).toBe(1)

      setInterrupts([
        {
          id: 'approval_tc-buy',
          interruptId: 'approval_tc-buy',
          kind: 'tool-approval',
          toolName: 'purchaseItem',
          toolCallId: 'tc-buy',
          status: 'pending',
          canResolve: true,
          reason: 'tool_approval',
          threadId: 'thread-1',
          interruptedRunId: 'run-1',
          generation: 0,
          errors: [],
          resolveInterrupt: () => {},
          cancel: () => {},
          clearResolution: () => {},
        },
      ])

      expect(container.innerHTML).toContain('approve:approval_tc-buy')
      expect(container.innerHTML).toContain('data-status="pending"')
      expect(mounts).toBe(1)
    } finally {
      dispose()
    }
  })

  it('renders an activity part with the activitiesComponents entry of its type', () => {
    const UI = createChatUI(chatOptions, activityConfig)
    const chat = host([
      activityMessage('sandbox.status', {
        status: 'starting',
        provider: 'e2b',
      }),
    ])
    expect(renderHtml(() => <UI.Chat chat={chat} />)).toBe(
      '<article><b>starting</b></article>',
    )
  })

  it('renders partsComponents.activity for a type with no entry', () => {
    const UI = createChatUI(chatOptions, activityConfig)
    const chat = host([activityMessage('deploy.progress', { step: 1 })])
    expect(renderHtml(() => <UI.Chat chat={chat} />)).toBe(
      '<article><i>deploy.progress</i></article>',
    )
  })
})
