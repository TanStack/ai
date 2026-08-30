import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Chat, useChatContext } from '../../src/chat-ui/create-ui'
import type {
  ChatUIComponents,
  ChatUIHost,
} from '../../src/chat-ui/create-ui'
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

function host(
  init?: Parameters<typeof createChatResult>[0],
): ChatUIHost<typeof chatOptions> {
  return createChatResult(init ?? {}) as unknown as ChatUIHost<
    typeof chatOptions
  >
}

const baseComponents: ChatUIComponents<typeof chatOptions> = {
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

function render(
  chat: ChatUIHost<typeof chatOptions>,
  patch?: Partial<ChatUIComponents<typeof chatOptions>> & {
    parts?: ChatUIComponents<typeof chatOptions>['parts']
    tools?: ChatUIComponents<typeof chatOptions>['tools']
    interrupts?: ChatUIComponents<typeof chatOptions>['interrupts']
  },
) {
  const components: ChatUIComponents<typeof chatOptions> = {
    ...baseComponents,
    ...patch,
    parts: { ...baseComponents.parts, ...patch?.parts },
    tools: { ...baseComponents.tools, ...patch?.tools },
    interrupts: {
      tools: {
        ...baseComponents.interrupts.tools,
        ...patch?.interrupts?.tools,
      },
      generic: {
        ...baseComponents.interrupts.generic,
        ...patch?.interrupts?.generic,
      },
    },
  }
  return renderToStaticMarkup(<Chat chat={chat} components={components} />)
}

describe('Chat', () => {
  it('renders mapped tools from chat.messages', () => {
    expect(render(host({ messages: [messageWithToolResults] }))).toContain(
      '<strong>Paris</strong>',
    )
  })

  it('warns once for a missing runtime key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const chat = host({ messages: [unknownToolMessage] })
    render(chat)
    render(chat)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('keeps unmatched tool results and suppresses matched ones', () => {
    const parts = {
      toolResult: ({ part }: { part: { type: string; content?: unknown } }) =>
        part.type === 'tool-result' ? <em>{String(part.content)}</em> : null,
      fallback: () => null,
    }
    const matched = render(host({ messages: [messageWithToolResults] }), {
      parts,
      tools: {
        getWeather: () => <strong>weather</strong>,
        purchaseItem: () => null,
      },
    })
    expect(matched).toContain('<strong>weather</strong>')
    expect(matched).not.toContain('<em>')

    const unmatched = render(host({ messages: [orphanResultMessage] }), {
      parts,
      tools: {
        getWeather: () => <strong>weather</strong>,
        purchaseItem: () => null,
      },
    })
    expect(unmatched).toContain('<em>standalone</em>')
  })

  it('puts list approvals in the interrupt list when interrupts.tools has the tool', () => {
    const markup = render(
      host({
        messages: [purchaseApprovalMessage],
        interrupts: [purchaseApprovalInterrupt],
      }),
      {
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
      },
    )
    expect(markup).toContain('list-approval')
    expect(markup).toContain('tool')
  })

  it('lets a tool render its approval from interrupt without a registered interrupt component', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const markup = render(
      host({
        messages: [purchaseApprovalMessage],
        interrupts: [purchaseApprovalInterrupt],
      }),
      {
        tools: {
          getWeather: () => null,
          purchaseItem: ({ interrupt }) =>
            interrupt ? <b>{interrupt.toolName}</b> : <span>tool</span>,
        },
        interrupts: {
          generic: { choosePlan: () => null, fallback: () => <i>list</i> },
        },
      },
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
    const markup = render(
      host({
        interrupts: [genericInterrupt, unboundInterrupt],
      }),
      {
        layout: ({ renderInterrupts }) => renderInterrupts(),
        interrupts: {
          generic: {
            choosePlan: () => <span>plan</span>,
            fallback: () => <span>fallback</span>,
          },
        },
      },
    )
    expect(markup).toContain('plan')
    expect(markup).toContain('fallback')
  })

  it('omits input when no input component exists', () => {
    const markup = render(host({}), {
      layout: ({ renderInput }) => <main>{renderInput()}</main>,
    })
    expect(markup).toBe('<main></main>')
  })

  it('passes chat into the input component', () => {
    const markup = render(host({}), {
      input: ({ chat }) => <span>{chat.messages.length}</span>,
    })
    expect(markup).toContain('<span>0</span>')
  })

  it('throws useChatContext outside Chat', () => {
    function Broken() {
      useChatContext()
      return null
    }
    expect(() => renderToStaticMarkup(<Broken />)).toThrow(/useChatContext/)
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
    for (const state of states) {
      const markup = render(
        host({
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
        }),
        {
          tools: {
            getWeather: ({ part }) => <span>{part.state}</span>,
            purchaseItem: () => null,
          },
        },
      )
      expect(markup).toContain(`<span>${state}</span>`)
    }
  })
})
