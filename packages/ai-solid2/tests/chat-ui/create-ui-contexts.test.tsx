import { createRoot, flush, useContext } from 'solid-js'
import { render } from '@solidjs/web'
import { afterEach, expect, it } from 'vitest'
import { createChatHookContexts } from '../../src/chat-ui/create-ui-contexts'
import { createChatUI } from '../../src/chat-ui/create-ui'
import { createSolidChatResult } from '../../../ai-client/tests/ui-fixtures'
import type { UseChatReturn } from '../../src/types'

const disposers: Array<() => void> = []
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

it('keeps useful missing-provider errors for both context hooks', () => {
  const contexts = createChatHookContexts()
  const UI = createChatUI(
    {},
    {
      components: { layout: () => null, message: () => null },
      partsComponents: {},
    },
  )
  createRoot((dispose) => {
    disposers.push(dispose)
    expect(() => contexts.useChatContext()).toThrow(
      '`useChatContext` must be used within `UI.Provider` or `UI.Chat`.',
    )
    expect(() => UI.useChatContext()).toThrow(
      '`useChatContext` must be used within `UI.Provider` or `UI.Chat`.',
    )
    expect(useContext(contexts.partContext)).toBeNull()
    expect(useContext(contexts.interruptContext)).toBeNull()
  })
})

it('isolates nested chats with custom Solid 2 provider contexts', () => {
  const outer = createChatHookContexts()
  const inner = createChatHookContexts()
  const outerChat = createSolidChatResult([
    { id: 'outer', role: 'user', parts: [] },
  ]) as unknown as UseChatReturn
  const innerChat = createSolidChatResult([
    { id: 'inner', role: 'user', parts: [] },
  ]) as unknown as UseChatReturn
  const OuterContext = outer.chatContext
  const InnerContext = inner.chatContext
  function ReadBoth() {
    const first = outer.useChatContext()
    const second = inner.useChatContext()
    return (
      <span>
        {first.messages()[0]?.id}:{second.messages()[0]?.id}
      </span>
    )
  }
  const container = document.createElement('div')
  disposers.push(
    render(
      () => (
        <OuterContext value={outerChat}>
          <InnerContext value={innerChat}>
            <ReadBoth />
          </InnerContext>
        </OuterContext>
      ),
      container,
    ),
  )
  flush()
  expect(container.textContent).toBe('outer:inner')
})
