// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { ComponentType } from 'react'
import { createChatUI } from '../../src/chat-ui/create-ui'
import type {
  ChatUIHost,
  MessageProps,
  SubagentProps,
} from '../../src/chat-ui/create-ui'
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
    components: {
      layout: ({ Messages }) => <Messages />,
      message: ({ Parts }) => {
        seen.push(Parts)
        return (
          <article>
            <Parts />
          </article>
        )
      },
    },
    partsComponents: { fallback: ({ part }) => <span>{part.type}</span> },
    toolsComponents: {
      getWeather: ({ part }) => <strong>{part.input?.city}</strong>,
      purchaseItem: () => null,
    },
    interruptsComponents: {
      generic: { choosePlan: () => null, fallback: () => null },
    },
  })

  const { rerender } = render(
    <UI.Chat chat={host({ messages: [messageWithToolResults] })} />,
  )

  // A new message object with the same id is what a stream chunk looks like.
  rerender(
    <UI.Chat chat={host({ messages: [{ ...messageWithToolResults }] })} />,
  )

  expect(seen.length).toBeGreaterThan(1)
  expect(new Set(seen).size).toBe(1)
})

it('keeps SubagentMessages identity across re-renders', () => {
  const seen: Array<ComponentType> = []
  const handle = {
    id: 'sub-1',
    name: 'researcher',
    status: 'running' as const,
    messages: [
      {
        id: 'child-1',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, content: 'Notes' }],
      },
    ],
  }
  const message = {
    id: 'parent-1',
    role: 'assistant' as const,
    parts: [{ type: 'subagent' as const, subagent: handle }],
  }

  const UI = createChatUI(chatOptions, {
    components: {
      layout: ({ Messages }) => <Messages />,
      message: ({ Parts }) => (
        <article>
          <Parts />
        </article>
      ),
    },
    partsComponents: {
      fallback: ({ part }) => <span>{part.type}</span>,
    },
    subagentsComponents: {
      researcher: ({ Parts }: SubagentProps<typeof chatOptions>) => {
        seen.push(Parts)
        return <Parts />
      },
    },
    toolsComponents: {
      getWeather: () => null,
      purchaseItem: () => null,
    },
    interruptsComponents: {
      generic: { choosePlan: () => null, fallback: () => null },
    },
  })

  const { rerender } = render(<UI.Chat chat={host({ messages: [message] })} />)
  rerender(
    <UI.Chat
      chat={host({
        messages: [
          {
            ...message,
            parts: [{ type: 'subagent', subagent: handle }],
          },
        ],
      })}
    />,
  )

  expect(seen.length).toBeGreaterThan(1)
  expect(new Set(seen).size).toBe(1)
})

it('does not re-render Subagents rows when only nested messages change', () => {
  let listRenders = 0
  const handle = {
    id: 'sub-1',
    name: 'writer',
    status: 'running' as const,
    messages: [
      {
        id: 'child-1',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, content: 'Draft' }],
      },
    ],
  }

  const UI = createChatUI(chatOptions, {
    components: {
      layout: ({ Subagents }) => <Subagents />,
      message: ({ Parts }) => (
        <article>
          <Parts />
        </article>
      ),
    },
    subagentsComponents: {
      writer: ({ Parts }: SubagentProps<typeof chatOptions>) => {
        listRenders += 1
        return (
          <section>
            <Parts />
          </section>
        )
      },
    },
    partsComponents: {
      text: ({ part }) => <span>{part.content}</span>,
      fallback: ({ part }) => <span>{part.type}</span>,
    },
    toolsComponents: {
      getWeather: () => null,
      purchaseItem: () => null,
    },
    interruptsComponents: {
      generic: { choosePlan: () => null, fallback: () => null },
    },
  })

  const { rerender, getByText } = render(
    <UI.Chat chat={host({ subagents: [handle] })} />,
  )
  getByText('Draft')
  const first = listRenders
  rerender(
    <UI.Chat
      chat={host({
        subagents: [
          {
            ...handle,
            messages: [
              {
                id: 'child-1',
                role: 'assistant',
                parts: [{ type: 'text', content: 'Draft v2' }],
              },
            ],
          },
        ],
      })}
    />,
  )
  expect(listRenders).toBe(first)
  // The row did not render again, but the child text still updated.
  getByText('Draft v2')
})
