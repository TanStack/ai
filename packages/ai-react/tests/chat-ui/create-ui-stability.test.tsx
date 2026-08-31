// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createChatUI } from '../../src/chat-ui/create-ui'
import type { ChatUIHost, MessageProps } from '../../src/chat-ui/create-ui'
import {
  chatOptions,
  createChatResult,
  messageWithToolResults,
} from '../../../ai-client/tests/ui-fixtures'

function host(
  init?: Parameters<typeof createChatResult>[0],
): ChatUIHost<typeof chatOptions> {
  return createChatResult(init ?? {}) as unknown as ChatUIHost<
    typeof chatOptions
  >
}

// `Parts` closes over the message, so the naive implementation builds a new
// component on every render and React remounts the whole part subtree — which
// during streaming means once per token. Identity must be constant instead.
it('hands `message` the same `Parts` component across re-renders', () => {
  const seen: Array<MessageProps<typeof chatOptions>['Parts']> = []

  const UI = createChatUI(chatOptions, {
    layout: ({ Messages }) => <Messages />,
    message: ({ Parts }) => {
      seen.push(Parts)
      return (
        <article>
          <Parts />
        </article>
      )
    },
    parts: { fallback: ({ part }) => <span>{part.type}</span> },
    tools: {
      getWeather: ({ part }) => <strong>{part.input?.city}</strong>,
      purchaseItem: () => null,
    },
    interrupts: {
      generic: { choosePlan: () => null, fallback: () => null },
    },
  })

  const { rerender } = render(<UI.Chat chat={host({ messages: [messageWithToolResults] })} />)

  // A new message object with the same id is what a stream chunk looks like.
  rerender(
    <UI.Chat chat={host({ messages: [{ ...messageWithToolResults }] })} />,
  )

  expect(seen.length).toBeGreaterThan(1)
  expect(new Set(seen).size).toBe(1)
})
