import { $, component$, useSignal } from '@qwik.dev/core'
import type { DocumentHead } from '@qwik.dev/router'
import { useChat } from '@tanstack/ai-qwik'

function getTextPartContent(part: { type: string; content?: string }) {
  return part.type === 'text' ? part.content || '' : ''
}

export default component$(() => {
  const input = useSignal('')
  const chat = useChat({ api: '/api/chat' })

  const send = $(async () => {
    const message = input.value.trim()
    if (!message || chat.isLoading.value) return
    input.value = ''
    await chat.sendMessage(message)
  })

  return (
    <main class="chat-shell">
      <section class="chat-panel" aria-label="Qwik chat example">
        <header class="chat-header">
          <div>
            <p class="eyebrow">TanStack AI + Qwik City</p>
            <h1>Qwik Chat</h1>
          </div>
          <div class="status-pill" data-status={chat.status.value}>
            {chat.status.value}
          </div>
        </header>

        <div class="messages" aria-live="polite">
          {chat.messages.value.length === 0 ? (
            <div class="empty-state">
              <h2>Ask a question to test the Qwik adapter.</h2>
              <p>
                This page is rendered by Qwik Router and streams responses from
                the Qwik endpoint at <code>/api/chat</code>.
              </p>
            </div>
          ) : (
            chat.messages.value.map((message) => (
              <article
                class={['message', `message-${message.role}`]}
                key={message.id}
              >
                <div class="message-author">
                  {message.role === 'assistant' ? 'AI' : 'You'}
                </div>
                <div class="message-body">
                  {message.parts.map((part, index) => {
                    if (part.type === 'text') {
                      return (
                        <p key={`${message.id}-text-${index}`}>
                          {getTextPartContent(part)}
                        </p>
                      )
                    }

                    if (part.type === 'thinking') {
                      return (
                        <details key={`${message.id}-thinking-${index}`}>
                          <summary>Thinking</summary>
                          <pre>{part.content}</pre>
                        </details>
                      )
                    }

                    if (part.type === 'tool-call') {
                      return (
                        <pre
                          key={`${message.id}-tool-${index}`}
                          class="tool-call"
                        >
                          {part.name}: {part.state}
                        </pre>
                      )
                    }

                    return null
                  })}
                </div>
              </article>
            ))
          )}
        </div>

        {chat.error.value ? (
          <p class="error-message" role="alert">
            {chat.error.value.message}
          </p>
        ) : null}

        <form
          class="composer"
          preventdefault:submit
          onSubmit$={send}
          aria-label="Send message"
        >
          <label class="sr-only" for="message">
            Message
          </label>
          <textarea
            id="message"
            value={input.value}
            onInput$={(_, element) => {
              input.value = element.value
            }}
            placeholder="Ask about TanStack AI, Qwik, or streaming..."
            rows={2}
            disabled={chat.isLoading.value}
          />
          {chat.isLoading.value ? (
            <button type="button" onClick$={chat.stop}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!input.value.trim()}>
              Send
            </button>
          )}
        </form>
      </section>
    </main>
  )
})

export const head: DocumentHead = {
  title: 'TanStack AI - Qwik Chat',
  meta: [
    {
      name: 'description',
      content: 'Qwik City chat example for the TanStack AI Qwik adapter.',
    },
  ],
}
