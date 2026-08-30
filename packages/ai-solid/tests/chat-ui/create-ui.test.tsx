import { render } from 'solid-js/web'
import { describe, expect, it, vi } from 'vitest'
import { Chat } from '../../src/chat-ui/create-ui'
import type {
  ChatUIComponents,
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
  render(node as () => import('solid-js').JSX.Element, container)
  return container.innerHTML
}

const baseComponents: ChatUIComponents<typeof chatOptions> = {
  layout: (props) => <>{props.renderMessages()}</>,
  message: (props) => <article>{props.renderParts()}</article>,
  parts: { fallback: (props) => <span>{props.part.type}</span> },
  tools: {
    getWeather: (props) => <strong>{props.part.input?.city}</strong>,
    purchaseItem: () => null,
  },
  interrupts: { generic: { choosePlan: () => null, fallback: () => null } },
}

describe('Solid Chat', () => {
  it('renders mapped tools from chat.messages', () => {
    const chat = host([messageWithToolResults])
    expect(
      renderHtml(() => <Chat chat={chat} components={baseComponents} />),
    ).toContain('<strong>Paris</strong>')
  })

  it('warns once for a missing runtime key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const chat = host([unknownToolMessage])
    renderHtml(() => <Chat chat={chat} components={baseComponents} />)
    renderHtml(() => <Chat chat={chat} components={baseComponents} />)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
