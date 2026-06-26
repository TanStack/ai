import { createDOM } from '@qwik.dev/core/testing'
import { component$ } from '@qwik.dev/core'
import { describe, expect, test } from 'vitest'
import { useChat } from '../src'
import type { UIMessage } from '../src'

const initialMessages: Array<UIMessage> = [
  {
    id: 'message-1',
    role: 'assistant',
    parts: [{ type: 'text', content: 'Initial chat message' }],
  },
]

const ChatHarness = component$(() => {
  const chat = useChat({
    api: '/api/chat',
    initialMessages,
  })

  return (
    <section data-testid="ai-qwik-chat">
      <p>Status {chat.status.value}</p>
      {chat.messages.value.map((message) => (
        <article key={message.id}>
          {message.parts.map((part, index) =>
            part.type === 'text' ? (
              <p key={`${message.id}-${index}`}>{part.content}</p>
            ) : null,
          )}
        </article>
      ))}
    </section>
  )
})

describe('@tanstack/ai-qwik useChat', () => {
  test('renders initial messages inside a Qwik component', async () => {
    const { screen, render } = await createDOM()

    await render(<ChatHarness />)

    expect(screen.outerHTML).toContain('Status ready')
    expect(screen.outerHTML).toContain('Initial chat message')
  })
})
