import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createChatUI } from '../src/create-ui'
import { createChatUIContexts } from '../src/create-ui-contexts'
import type { ChatUIFactoryConfig, ChatUIHost } from '../src/create-ui'
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
} from '../../ai-client/tests/ui-fixtures'
import type { ToolCallState } from '@tanstack/ai-client'

function host(
  init?: Parameters<typeof createChatResult>[0],
): ChatUIHost<typeof chatOptions> {
  return createChatResult(init ?? {}) as unknown as ChatUIHost<
    typeof chatOptions
  >
}

const baseConfig: ChatUIFactoryConfig<typeof chatOptions> = {
  layout: ({ renderMessages, renderInterrupts, renderInput }) => (
    <>
      {renderMessages()}
      {renderInterrupts()}
      {renderInput()}
    </>
  ),
  message: ({ renderParts }) => <article>{renderParts()}</article>,
  parts: { fallback: ({ part }) => <span>{part.type}</span> },
  tools: {
    getWeather: ({ part }) => <strong>{part.input?.city}</strong>,
    purchaseItem: () => null,
  },
  interrupts: {
    generic: {
      choosePlan: () => null,
      fallback: ({ interrupt }) => <i>{interrupt.reason}</i>,
    },
  },
}

function makeUI(
  patch?: Partial<ChatUIFactoryConfig<typeof chatOptions>> & {
    parts?: ChatUIFactoryConfig<typeof chatOptions>['parts']
    tools?: ChatUIFactoryConfig<typeof chatOptions>['tools']
    interrupts?: ChatUIFactoryConfig<typeof chatOptions>['interrupts']
    input?: ChatUIFactoryConfig<typeof chatOptions>['input']
    layout?: ChatUIFactoryConfig<typeof chatOptions>['layout']
    message?: ChatUIFactoryConfig<typeof chatOptions>['message']
  },
) {
  return createChatUI(chatOptions, {
    ...baseConfig,
    ...patch,
    parts: { ...baseConfig.parts, ...patch?.parts },
    tools: { ...baseConfig.tools, ...patch?.tools },
    interrupts: {
      tools: {
        ...baseConfig.interrupts.tools,
        ...patch?.interrupts?.tools,
      },
      generic: {
        ...baseConfig.interrupts.generic,
        ...patch?.interrupts?.generic,
      },
    },
  })
}

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
      parts: {
        toolResult: ({ part }) =>
          part.type === 'tool-result' ? <em>{String(part.content)}</em> : null,
        fallback: () => null,
      },
      tools: {
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
      tools: {
        getWeather: () => null,
        purchaseItem: () => <div>tool</div>,
      },
      interrupts: {
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
      tools: {
        getWeather: () => null,
        purchaseItem: ({ interrupt }) =>
          interrupt ? <b>{interrupt.toolName}</b> : <span>tool</span>,
      },
      interrupts: {
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
      layout: ({ renderInterrupts }) => renderInterrupts(),
      interrupts: {
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

  it('omits input when no input component exists', () => {
    const UI = makeUI({
      layout: ({ renderInput }) => <main>{renderInput()}</main>,
    })
    const markup = renderToStaticMarkup(<UI.Chat chat={host({})} />)
    expect(markup).toBe('<main></main>')
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
      parts: {
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
      layout: ({ renderInterrupts }) => renderInterrupts(),
      interrupts: {
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
    expect(() => renderToStaticMarkup(<Broken />)).toThrow(
      /useChatContext/,
    )
  })

  it('isolates nested chats when createChatUIContexts is passed in', () => {
    const innerContexts = createChatUIContexts()
    const Outer = makeUI({
      layout: () => {
        const chat = Outer.useChatContext()
        return <p data-outer="">{chat.messages.length}</p>
      },
    })
    const Inner = makeUI({
      chatContext: innerContexts.chatContext,
      partContext: innerContexts.partContext,
      interruptContext: innerContexts.interruptContext,
      layout: () => {
        const chat = Inner.useChatContext()
        return <p data-inner="">{chat.messages.length}</p>
      },
    })

    const markup = renderToStaticMarkup(
      <Outer.Provider chat={host({ messages: [] })}>
        <Inner.Chat
          chat={host({ messages: [messageWithToolResults] })}
        />
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
      tools: {
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
})
