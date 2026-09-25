import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

/**
 * Browser half of the history-paging harness.
 *
 * `persistence: true` plus `history.pageSize` hydrates the newest window and
 * exposes Load older. The matching endpoint is `/api/message-history-paging`.
 */

const arrayConnection = fetchServerSentEvents('/api/message-history-paging')
const pageConnection = fetchServerSentEvents(
  '/api/message-history-paging?store=page',
)

export const Route = createFileRoute('/message-history-paging')({
  component: MessageHistoryPagingPage,
  validateSearch: (search: Record<string, unknown>) => ({
    threadId:
      typeof search.threadId === 'string' && search.threadId !== ''
        ? search.threadId
        : 'missing-thread',
    store: search.store === 'page' ? ('page' as const) : ('array' as const),
    pageSize:
      typeof search.pageSize === 'number' &&
      Number.isInteger(search.pageSize) &&
      search.pageSize > 0
        ? search.pageSize
        : typeof search.pageSize === 'string' &&
            Number.isInteger(Number(search.pageSize)) &&
            Number(search.pageSize) > 0
          ? Number(search.pageSize)
          : 2,
  }),
})

function MessageHistoryPagingPage() {
  const { threadId, store, pageSize } = Route.useSearch()
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  const {
    messages,
    sendMessage,
    isLoading,
    hasOlderMessages,
    loadOlderMessages,
  } = useChat({
    threadId,
    connection: store === 'page' ? pageConnection : arrayConnection,
    persistence: true,
    history: { pageSize },
  })

  const [input, setInput] = useState('')

  const handleSubmit = () => {
    const text = input.trim()
    if (text === '') return
    setInput('')
    void sendMessage(text)
  }

  return (
    <div data-testid="message-history-paging-page" style={{ padding: 16 }}>
      {hydrated ? <div data-testid="hydration-marker" /> : null}
      <div
        data-testid="painted-ids"
        data-ids={messages.map((message) => message.id).join(',')}
        hidden
      />
      <div
        data-testid="has-older"
        data-has-older={String(hasOlderMessages)}
        hidden
      />

      {hasOlderMessages ? (
        <button
          type="button"
          data-testid="load-older"
          onClick={() => {
            void loadOlderMessages()
          }}
        >
          Load older
        </button>
      ) : null}

      <div data-testid="message-list">
        {messages.map((message) => (
          <div
            key={message.id}
            data-testid={
              message.role === 'user' ? 'user-message' : 'assistant-message'
            }
            data-id={message.id}
          >
            {message.parts.map((part, index) =>
              part.type === 'text' ? (
                <span key={`${message.id}-${index}`} data-testid="text-part">
                  {part.content}
                </span>
              ) : null,
            )}
          </div>
        ))}
      </div>

      {isLoading ? (
        <div data-testid="loading-indicator">Generating...</div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          data-testid="chat-input"
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              handleSubmit()
            }
          }}
        />
        <button
          data-testid="send-button"
          type="button"
          onClick={handleSubmit}
          disabled={input.trim() === ''}
        >
          Send
        </button>
      </div>
    </div>
  )
}
