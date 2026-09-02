import { render } from '@octanejs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import { createChatUI } from '../../src/chat-ui/create-ui.tsrx'
import { createChatHook } from '../../src/chat-ui/create-chat-hook.tsrx'
import { createChatHookContexts } from '../../src/chat-ui/create-ui-contexts.tsrx'
import type {
  ChatUIFactoryConfig,
  ChatUIHost,
} from '../../src/chat-ui/create-ui.tsrx'
import {
  chatOptions,
  createChatResult,
  genericInterrupt,
  messageWithToolResults,
  orphanResultMessage,
  purchaseApprovalInterrupt,
  purchaseApprovalMessage,
  unboundInterrupt,
  unknownToolMessage,
} from '../../../ai-client/tests/ui-fixtures'
import type { ToolCallState } from '@tanstack/ai-client'

function renderToStaticMarkup(ui: Parameters<typeof render>[0]) {
  const { container } = render(ui)
  return container.innerHTML.replaceAll('<!---->', '')
}

function host(
  init?: Parameters<typeof createChatResult>[0],
): ChatUIHost<typeof chatOptions> {
  return createChatResult(init ?? {}) as unknown as ChatUIHost<
    typeof chatOptions
  >
}

const baseConfig: ChatUIFactoryConfig<typeof chatOptions> = {
  components: {
    layout: ({ Messages, Interrupts }) => (
      <>
        <Messages />
        <Interrupts />
      </>
    ),
    message: ({ Parts }) => (
      <article>
        <Parts />
      </article>
    ),
  },
  partsComponents: { fallback: ({ part }) => <span>{part.type}</span> },
  toolsComponents: {
    getWeather: ({ part }) => <strong>{part.input?.city}</strong>,
    purchaseItem: () => null,
  },
  interruptsComponents: {
    generic: {
      choosePlan: () => null,
      fallback: ({ interrupt }) => <i>{interrupt.reason}</i>,
    },
  },
}

type Config = ChatUIFactoryConfig<typeof chatOptions>

// The helper keeps `layout` / `message` / `input` flat for brevity and
// assembles them into `components`; the shape under test is what reaches
// `createChatUI`.
function makeUI(patch?: {
  context?: Config['context']
  layout?: Config['components']['layout']
  message?: Config['components']['message']
  input?: Config['components']['input']
  queue?: Config['components']['queue']
  partsComponents?: Config['partsComponents']
  toolsComponents?: Config['toolsComponents']
  interruptsComponents?: {
    tools?: Config['interruptsComponents']['tools']
    generic?: Partial<Config['interruptsComponents']['generic']>
  }
}) {
  return createChatUI(chatOptions, {
    ...(patch?.context ? { context: patch.context } : {}),
    components: {
      ...baseConfig.components,
      ...(patch?.layout ? { layout: patch.layout } : {}),
      ...(patch?.message ? { message: patch.message } : {}),
      ...(patch?.input ? { input: patch.input } : {}),
      ...(patch?.queue ? { queue: patch.queue } : {}),
    },
    partsComponents: {
      ...baseConfig.partsComponents,
      ...patch?.partsComponents,
    },
    toolsComponents: {
      ...baseConfig.toolsComponents,
      ...patch?.toolsComponents,
    },
    interruptsComponents: {
      tools: {
        ...baseConfig.interruptsComponents.tools,
        ...patch?.interruptsComponents?.tools,
      },
      generic: {
        ...baseConfig.interruptsComponents.generic,
        ...patch?.interruptsComponents?.generic,
      },
    },
  })
}

describe('createChatHook', () => {
  it('mixes AppChat onto the instance from options and chatComponents', () => {
    const { useAppChat, useChatContext } = createChatHook({
      options: chatOptions,
      ...baseConfig,
    })
    expect(typeof useAppChat).toBe('function')
    expect(typeof useChatContext).toBe('function')

    function Screen() {
      const chat = useAppChat({
        initialMessages: [messageWithToolResults] as ChatUIHost<
          typeof chatOptions
        >['messages'],
      })
      return <chat.AppChat />
    }

    const markup = renderToStaticMarkup(<Screen />)
    expect(markup).toContain('<strong>Paris</strong>')
  })
})

describe('createChatUI', () => {
  it('renders automatic and manual trees', () => {
    const UI = makeUI()
    const chat = host({ messages: [messageWithToolResults] })
    const automatic = renderToStaticMarkup(<UI.Chat chat={chat} />)
    expect(automatic).toContain('<strong>Paris</strong>')

    const manual = renderToStaticMarkup(
      <UI.Provider chat={chat}>
        <UI.Messages>
          {(messages) => <span>{messages.length}</span>}
        </UI.Messages>
      </UI.Provider>,
    )
    expect(manual).toContain('<span>1</span>')
  })

  it('warns once for a missing runtime key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const UI = makeUI()
    const chat = host({ messages: [unknownToolMessage] })
    renderToStaticMarkup(<UI.Chat chat={chat} />)
    renderToStaticMarkup(<UI.Chat chat={chat} />)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('keeps unmatched tool results and suppresses matched ones', () => {
    const UI = makeUI({
      partsComponents: {
        toolResult: ({ part }) =>
          part.type === 'tool-result' ? <em>{String(part.content)}</em> : null,
        fallback: () => null,
      },
      toolsComponents: {
        getWeather: () => <strong>weather</strong>,
        purchaseItem: () => null,
      },
    })

    const matched = renderToStaticMarkup(
      <UI.Chat chat={host({ messages: [messageWithToolResults] })} />,
    )
    expect(matched).toContain('<strong>weather</strong>')
    expect(matched).not.toContain('<em>')

    const unmatched = renderToStaticMarkup(
      <UI.Chat chat={host({ messages: [orphanResultMessage] })} />,
    )
    expect(unmatched).toContain('<em>standalone</em>')
  })

  it('puts list approvals in Interrupts when interrupts.tools has the tool', () => {
    const UI = makeUI({
      toolsComponents: {
        getWeather: () => null,
        purchaseItem: () => <div>tool</div>,
      },
      interruptsComponents: {
        tools: {
          purchaseItem: () => <b>list-approval</b>,
        },
        generic: { choosePlan: () => null, fallback: () => null },
      },
    })

    const listMarkup = renderToStaticMarkup(
      <UI.Chat
        chat={host({
          messages: [purchaseApprovalMessage],
          interrupts: [purchaseApprovalInterrupt],
        })}
      />,
    )
    expect(listMarkup).toContain('list-approval')
    expect(listMarkup).toContain('tool')
  })

  it('lets a tool render its approval from interrupt without a registered interrupt component', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const UI = makeUI({
      toolsComponents: {
        getWeather: () => null,
        purchaseItem: ({ interrupt }) =>
          interrupt ? <b>{interrupt.toolName}</b> : <span>tool</span>,
      },
      interruptsComponents: {
        generic: { choosePlan: () => null, fallback: () => <i>list</i> },
      },
    })
    const markup = renderToStaticMarkup(
      <UI.Chat
        chat={host({
          messages: [purchaseApprovalMessage],
          interrupts: [purchaseApprovalInterrupt],
        })}
      />,
    )
    expect(markup).toContain('<b>purchaseItem</b>')
    expect(markup).not.toContain('<i>list</i>')
    expect(
      warn.mock.calls.filter((call) =>
        String(call[0]).includes('[tanstack-ai-ui]'),
      ),
    ).toHaveLength(0)
    warn.mockRestore()
  })

  it('renders registered generic interrupts and sends the rest to fallback', () => {
    const UI = makeUI({
      layout: ({ Interrupts }) => <Interrupts />,
      interruptsComponents: {
        generic: {
          choosePlan: () => <span>plan</span>,
          fallback: () => <span>fallback</span>,
        },
      },
    })

    const markup = renderToStaticMarkup(
      <UI.Chat
        chat={host({
          interrupts: [genericInterrupt, unboundInterrupt],
        })}
      />,
    )
    expect(markup).toContain('plan')
    expect(markup).toContain('fallback')
  })

  it('warns once when layout renders an Input that was never registered', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const UI = makeUI({
      layout: ({ Input }) => (
        <main>
          <Input />
        </main>
      ),
    })
    // Twice: the warning is once per kit, not once per render.
    renderToStaticMarkup(<UI.Chat chat={host({})} />)
    const markup = renderToStaticMarkup(<UI.Chat chat={host({})} />)
    expect(markup).toBe('<main></main>')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      'no `input` component is registered',
    )
    warn.mockRestore()
  })

  it('passes Input to layout when an input component is registered', () => {
    const UI = createChatUI(chatOptions, {
      ...baseConfig,
      components: {
        ...baseConfig.components,
        input: () => <textarea defaultValue="prompt" />,
        layout: ({ Input }) => (
          <main>
            <Input />
          </main>
        ),
      },
    })
    const markup = renderToStaticMarkup(<UI.Chat chat={host({})} />)
    expect(markup).toContain('prompt')
  })

  it('mixes Input onto the UI kit when one is registered', () => {
    const UI = makeUI({
      input: () => <textarea defaultValue="prompt" />,
    })
    const Input = UI.Input
    if (!Input) throw new Error('expected Input')
    const markup = renderToStaticMarkup(
      <UI.Provider chat={host({})}>
        <Input />
      </UI.Provider>,
    )
    expect(markup).toContain('prompt')
  })

  it('lets Message children pick a mixed part or tool widget', () => {
    const UI = makeUI({
      partsComponents: {
        fallback: () => <span>fallback</span>,
        text: ({ part }) =>
          part.type === 'text' ? <em>{part.content}</em> : null,
      },
    })
    const chat = host({ messages: [messageWithToolResults] })
    const markup = renderToStaticMarkup(
      <UI.Provider chat={chat}>
        <UI.Messages>
          {(messages) =>
            messages.map((message) => (
              <UI.Message key={message.id} message={message}>
                {(parts) =>
                  parts.map((part, index) => (
                    <UI.Part key={index} part={part}>
                      {(p) =>
                        part.key === 'toolCall' ? (
                          <p.getWeather />
                        ) : (
                          <p.Render />
                        )
                      }
                    </UI.Part>
                  ))
                }
              </UI.Message>
            ))
          }
        </UI.Messages>
      </UI.Provider>,
    )
    expect(markup).toContain('<strong>Paris</strong>')
  })

  it('lets Interrupt children pick a mixed interrupt widget', () => {
    const UI = makeUI({
      layout: ({ Interrupts }) => <Interrupts />,
      interruptsComponents: {
        generic: {
          choosePlan: () => <span>plan</span>,
          fallback: () => <span>fallback</span>,
        },
      },
    })
    const markup = renderToStaticMarkup(
      <UI.Provider
        chat={host({
          interrupts: [genericInterrupt],
        })}
      >
        <UI.Interrupts>
          {(interrupts) =>
            interrupts.map((interrupt) => (
              <UI.Interrupt key={interrupt.id} interrupt={interrupt}>
                {(item) => {
                  const ChoosePlan = item.choosePlan
                  return <ChoosePlan />
                }}
              </UI.Interrupt>
            ))
          }
        </UI.Interrupts>
      </UI.Provider>,
    )
    expect(markup).toContain('plan')
  })

  it('reads chat from nested provider context and throws outside a provider', () => {
    const UI = makeUI({
      layout: () => {
        const chat = UI.useChatContext()
        return <p>{chat.messages.length}</p>
      },
    })

    const inner = host({ messages: [messageWithToolResults] })
    const outer = host({ messages: [] })
    const markup = renderToStaticMarkup(
      <UI.Provider chat={outer}>
        <UI.Chat chat={inner} />
      </UI.Provider>,
    )
    expect(markup).toContain('<p>1</p>')

    function Broken() {
      UI.useChatContext()
      return null
    }
    expect(() => renderToStaticMarkup(<Broken />)).toThrow(/useChatContext/)
  })

  it('isolates nested chats when createChatHookContexts is passed in', () => {
    const innerContexts = createChatHookContexts()
    const Outer = makeUI({
      layout: () => {
        const chat = Outer.useChatContext()
        return <p data-outer="">{chat.messages.length}</p>
      },
    })
    const Inner = makeUI({
      context: {
        chatContext: innerContexts.chatContext,
        partContext: innerContexts.partContext,
        interruptContext: innerContexts.interruptContext,
      },
      layout: () => {
        const chat = Inner.useChatContext()
        return <p data-inner="">{chat.messages.length}</p>
      },
    })

    const markup = renderToStaticMarkup(
      <Outer.Provider chat={host({ messages: [] })}>
        <Inner.Chat chat={host({ messages: [messageWithToolResults] })} />
      </Outer.Provider>,
    )
    expect(markup).toContain('data-inner')
    expect(markup).toContain('<p data-inner="">1</p>')
  })

  it('renders a tool component for every ToolCallState', () => {
    const states: Array<ToolCallState> = [
      'awaiting-input',
      'input-streaming',
      'input-complete',
      'approval-requested',
      'approval-responded',
      'complete',
      'error',
    ]
    const UI = makeUI({
      toolsComponents: {
        getWeather: ({ part }) => <span>{part.state}</span>,
        purchaseItem: () => null,
      },
    })

    for (const state of states) {
      const markup = renderToStaticMarkup(
        <UI.Chat
          chat={host({
            messages: [
              {
                id: state,
                role: 'assistant',
                parts: [
                  {
                    type: 'tool-call',
                    id: `call-${state}`,
                    name: 'getWeather',
                    arguments: '{}',
                    state,
                  },
                ],
              },
            ],
          })}
        />,
      )
      expect(markup).toContain(`<span>${state}</span>`)
    }
  })

  it('renders each queued item and binds cancelQueued', () => {
    const cancelled: Array<string> = []
    const UI = makeUI({
      layout: ({ Queue }) => <Queue />,
      queue: ({ item }) => {
        item.cancelQueued()
        return <em>{typeof item.content === 'string' ? item.content : ''}</em>
      },
    })
    const markup = renderToStaticMarkup(
      <UI.Chat
        chat={host({
          queue: [
            { id: 'q1', content: 'later', createdAt: 1 },
            { id: 'q2', content: 'after', createdAt: 2 },
          ],
          cancelQueued: (id) => {
            cancelled.push(id)
          },
        })}
      />,
    )
    expect(markup).toContain('<em>later</em>')
    expect(markup).toContain('<em>after</em>')
    expect(cancelled).toEqual(['q1', 'q2'])
  })

  it('renders nothing from Queue when no queue component exists', () => {
    const UI = makeUI({
      layout: ({ Queue }) => (
        <main>
          <Queue />
        </main>
      ),
    })
    const markup = renderToStaticMarkup(
      <UI.Chat
        chat={host({
          queue: [{ id: 'q1', content: 'later', createdAt: 1 }],
        })}
      />,
    )
    expect(markup).toBe('<main></main>')
  })
})
