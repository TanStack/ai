import { render } from 'solid-js/web'
import { describe, expect, it, vi } from 'vitest'
import { createChatUI } from '../src/create-ui'
import type { ChatUIFactoryConfig, ChatUIHost } from '../src/create-ui'
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

const baseConfig: ChatUIFactoryConfig<typeof chatOptions> = {
  layout: (props) => <>{props.renderMessages()}</>,
  message: (props) => <article>{props.renderParts()}</article>,
  parts: { fallback: (props) => <span>{props.part.type}</span> },
  tools: {
    getWeather: (props) => <strong>{props.part.input?.city}</strong>,
    purchaseItem: () => null,
  },
  interrupts: { generic: { choosePlan: () => null, fallback: () => null } },
}

describe('Solid createChatUI', () => {
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
})
