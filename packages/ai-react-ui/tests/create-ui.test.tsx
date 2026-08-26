import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createUI } from '../src/create-ui'
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

describe('createUI', () => {
  it('renders automatic and manual trees', () => {
    const UI = createUI(chatOptions)
    const components = UI.defineComponents({
      layout: ({ renderMessages, renderInterrupts }) => (
        <>
          {renderMessages()}
          {renderInterrupts()}
        </>
      ),
      message: ({ renderParts }) => <article>{renderParts()}</article>,
      parts: { fallback: ({ part }) => <span>{part.type}</span> },
      tools: {
        getWeather: ({ part }) => <strong>{part.input?.city}</strong>,
        purchaseItem: () => null,
      },
      interrupts: {
        generic: { fallback: ({ interrupt }) => <i>{interrupt.reason}</i> },
      },
    })

    const chat = createChatResult({ messages: [messageWithToolResults] })
    const automatic = renderToStaticMarkup(
      <UI.Chat chat={chat} components={components} />,
    )
    expect(automatic).toContain('<strong>Paris</strong>')

    const manual = renderToStaticMarkup(
      <UI.Provider chat={chat} components={components}>
        <UI.Messages>
          {(messages) => <span>{messages.length}</span>}
        </UI.Messages>
      </UI.Provider>,
    )
    expect(manual).toContain('<span>1</span>')
  })

  it('warns once for a missing runtime key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const UI = createUI(chatOptions)
    const chat = createChatResult({ messages: [unknownToolMessage] })
    const components = UI.defineComponents({
      layout: ({ renderMessages }) => renderMessages(),
      message: ({ renderParts }) => renderParts(),
      parts: { fallback: () => null },
      tools: {
        getWeather: () => null,
        purchaseItem: () => null,
      },
      interrupts: { generic: { fallback: () => null } },
    })
    renderToStaticMarkup(<UI.Chat chat={chat} components={components} />)
    renderToStaticMarkup(<UI.Chat chat={chat} components={components} />)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('keeps unmatched tool results and suppresses matched ones', () => {
    const UI = createUI(chatOptions)
    const components = UI.defineComponents({
      layout: ({ renderMessages }) => renderMessages(),
      message: ({ renderParts }) => renderParts(),
      parts: {
        toolResult: ({ part }) =>
          part.type === 'tool-result' ? <em>{String(part.content)}</em> : null,
        fallback: () => null,
      },
      tools: {
        getWeather: () => <strong>weather</strong>,
        purchaseItem: () => null,
      },
      interrupts: { generic: { fallback: () => null } },
    })

    const matched = renderToStaticMarkup(
      <UI.Chat
        chat={createChatResult({ messages: [messageWithToolResults] })}
        components={components}
      />,
    )
    expect(matched).toContain('<strong>weather</strong>')
    expect(matched).not.toContain('<em>')

    const unmatched = renderToStaticMarkup(
      <UI.Chat
        chat={createChatResult({ messages: [orphanResultMessage] })}
        components={components}
      />,
    )
    expect(unmatched).toContain('<em>standalone</em>')
  })

  it('puts inline approvals in the tool slot and list approvals in Interrupts', () => {
    const UI = createUI(chatOptions)
    const inline = UI.defineComponents({
      layout: ({ renderMessages, renderInterrupts }) => (
        <>
          {renderMessages()}
          {renderInterrupts()}
        </>
      ),
      message: ({ renderParts }) => renderParts(),
      parts: { fallback: () => null },
      tools: {
        getWeather: () => null,
        purchaseItem: ({ renderInterrupt }) => (
          <div>
            tool
            {renderInterrupt()}
          </div>
        ),
      },
      interrupts: {
        tools: {
          purchaseItem: {
            component: () => <b>inline-approval</b>,
            placement: 'inline',
          },
        },
        generic: { fallback: ({ interrupt }) => <i>{interrupt.reason}</i> },
      },
    })

    const inlineMarkup = renderToStaticMarkup(
      <UI.Chat
        chat={createChatResult({
          messages: [purchaseApprovalMessage],
          interrupts: [purchaseApprovalInterrupt],
        })}
        components={inline}
      />,
    )
    expect(inlineMarkup).toContain('inline-approval')
    expect(inlineMarkup).not.toContain('<i>')

    const list = UI.defineComponents({
      layout: ({ renderMessages, renderInterrupts }) => (
        <>
          {renderMessages()}
          {renderInterrupts()}
        </>
      ),
      message: ({ renderParts }) => renderParts(),
      parts: { fallback: () => null },
      tools: {
        getWeather: () => null,
        purchaseItem: ({ renderInterrupt }) => (
          <div>
            tool
            {renderInterrupt()}
          </div>
        ),
      },
      interrupts: {
        tools: {
          purchaseItem: () => <b>list-approval</b>,
        },
        generic: { fallback: () => null },
      },
    })

    const listMarkup = renderToStaticMarkup(
      <UI.Chat
        chat={createChatResult({
          messages: [purchaseApprovalMessage],
          interrupts: [purchaseApprovalInterrupt],
        })}
        components={list}
      />,
    )
    expect(listMarkup).toContain('list-approval')
  })

  it('renders registered generic interrupts and sends the rest to fallback', () => {
    const UI = createUI(chatOptions)
    const components = UI.defineComponents({
      layout: ({ renderInterrupts }) => renderInterrupts(),
      message: ({ renderParts }) => renderParts(),
      parts: { fallback: () => null },
      tools: {
        getWeather: () => null,
        purchaseItem: () => null,
      },
      interrupts: {
        generic: {
          choosePlan: () => <span>plan</span>,
          fallback: () => <span>fallback</span>,
        },
      },
    })

    const markup = renderToStaticMarkup(
      <UI.Chat
        chat={createChatResult({
          interrupts: [genericInterrupt, unboundInterrupt],
        })}
        components={components}
      />,
    )
    expect(markup).toContain('plan')
    expect(markup).toContain('fallback')
  })

  it('omits input when no input component exists', () => {
    const UI = createUI(chatOptions)
    const components = UI.defineComponents({
      layout: ({ renderInput }) => <main>{renderInput()}</main>,
      message: ({ renderParts }) => renderParts(),
      parts: { fallback: () => null },
    })
    const markup = renderToStaticMarkup(
      <UI.Chat chat={createChatResult({})} components={components} />,
    )
    expect(markup).toBe('<main></main>')
  })

  it('reads chat from nested provider context and throws outside a provider', () => {
    const UI = createUI(chatOptions)
    const components = UI.defineComponents({
      layout: () => {
        const chat = UI.useChat()
        return <p>{chat.messages.length}</p>
      },
      message: ({ renderParts }) => renderParts(),
      parts: { fallback: () => null },
    })

    const inner = createChatResult({ messages: [messageWithToolResults] })
    const outer = createChatResult({ messages: [] })
    const markup = renderToStaticMarkup(
      <UI.Provider chat={outer} components={components}>
        <UI.Chat chat={inner} components={components} />
      </UI.Provider>,
    )
    expect(markup).toContain('<p>1</p>')

    function Broken() {
      UI.useChat()
      return null
    }
    expect(() => renderToStaticMarkup(<Broken />)).toThrow(
      /UI.Provider or UI.Chat/,
    )
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
    const UI = createUI(chatOptions)
    const components = UI.defineComponents({
      layout: ({ renderMessages }) => renderMessages(),
      message: ({ renderParts }) => renderParts(),
      parts: { fallback: () => null },
      tools: {
        getWeather: ({ part }) => <span>{part.state}</span>,
        purchaseItem: () => null,
      },
      interrupts: { generic: { fallback: () => null } },
    })

    for (const state of states) {
      const markup = renderToStaticMarkup(
        <UI.Chat
          chat={createChatResult({
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
          components={components}
        />,
      )
      expect(markup).toContain(`<span>${state}</span>`)
    }
  })
})
