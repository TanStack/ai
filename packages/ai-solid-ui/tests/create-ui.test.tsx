import { render } from 'solid-js/web'
import { describe, expect, it, vi } from 'vitest'
import { createChatUI } from '../src/create-ui'
import type { ChatUIHost } from '../src/create-ui'
import {
  chatOptions,
  createSolidChatResult,
  messageWithToolResults,
  unknownToolMessage,
} from '../../ai-client/tests/ui-fixtures'

function host(
  ...args: Parameters<typeof createSolidChatResult>
): ChatUIHost<typeof chatOptions> {
  return createSolidChatResult(...args) as unknown as ChatUIHost<
    typeof chatOptions
  >
}

function renderHtml(node: () => unknown) {
  const container = document.createElement('div')
  render(node as () => import('solid-js').JSX.Element, container)
  return container.innerHTML
}

describe('Solid createChatUI', () => {
  it('renders automatic and manual traversal', () => {
    const UI = createChatUI(chatOptions)
    const chat = host([messageWithToolResults])
    const components = UI.defineComponents({
      layout: (props) => <>{props.renderMessages()}</>,
      message: (props) => <article>{props.renderParts()}</article>,
      parts: { fallback: (props) => <span>{props.part.type}</span> },
      tools: {
        getWeather: (props) => <strong>{props.part.input?.city}</strong>,
        purchaseItem: () => null,
      },
      interrupts: { generic: { choosePlan: () => null, fallback: () => null } },
    })

    expect(
      renderHtml(() => <UI.Chat chat={chat} components={components} />),
    ).toContain('<strong>Paris</strong>')
    expect(
      renderHtml(() => (
        <UI.Provider chat={chat} components={components}>
          <UI.Messages>
            {(messages) => <span>{messages().length}</span>}
          </UI.Messages>
        </UI.Provider>
      )),
    ).toContain('<span>1</span>')
  })

  it('warns once for a missing runtime key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const UI = createChatUI(chatOptions)
    const chat = host([unknownToolMessage])
    const components = UI.defineComponents({
      layout: (props) => props.renderMessages(),
      message: (props) => props.renderParts(),
      parts: { fallback: () => null },
      tools: {
        getWeather: () => null,
        purchaseItem: () => null,
      },
      interrupts: { generic: { choosePlan: () => null, fallback: () => null } },
    })
    renderHtml(() => <UI.Chat chat={chat} components={components} />)
    renderHtml(() => <UI.Chat chat={chat} components={components} />)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
