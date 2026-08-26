import { render } from 'solid-js/web'
import { describe, expect, it, vi } from 'vitest'
import { createUI } from '../src/create-ui'
import {
  chatOptions,
  createSolidChatResult,
  messageWithToolResults,
  unknownToolMessage,
} from '../../ai-client/tests/ui-fixtures'

function renderHtml(node: () => unknown) {
  const container = document.createElement('div')
  render(node as () => import('solid-js').JSX.Element, container)
  return container.innerHTML
}

describe('Solid createUI', () => {
  it('renders automatic and manual traversal', () => {
    const UI = createUI(chatOptions)
    const chat = createSolidChatResult([messageWithToolResults])
    const components = UI.defineComponents({
      layout: (props) => <>{props.renderMessages()}</>,
      message: (props) => <article>{props.renderParts()}</article>,
      parts: { fallback: (props) => <span>{props.part.type}</span> },
      tools: {
        getWeather: (props) => <strong>{props.part.input?.city}</strong>,
        purchaseItem: () => null,
      },
      interrupts: { generic: { fallback: () => null } },
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
    const UI = createUI(chatOptions)
    const chat = createSolidChatResult([unknownToolMessage])
    const components = UI.defineComponents({
      layout: (props) => props.renderMessages(),
      message: (props) => props.renderParts(),
      parts: { fallback: () => null },
      tools: {
        getWeather: () => null,
        purchaseItem: () => null,
      },
      interrupts: { generic: { fallback: () => null } },
    })
    renderHtml(() => <UI.Chat chat={chat} components={components} />)
    renderHtml(() => <UI.Chat chat={chat} components={components} />)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
