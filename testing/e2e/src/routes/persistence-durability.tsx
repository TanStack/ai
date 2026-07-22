import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { localStoragePersistence } from '@tanstack/ai-client'
import type { ChatPersistedState } from '@tanstack/ai-client'

/**
 * Browser-refresh persistence harness (client half).
 *
 * A `localStoragePersistence` adapter stores ONE combined `{ messages, resume }`
 * record per chat id (see `ChatPersistedState`), so a full `page.reload()`
 * restores the conversation — and any pending-interrupt resume snapshot —
 * straight from `localStorage`, with no server round-trip. The matching
 * provider-free durable endpoint is `/api/persistence-durability`.
 *
 * `?scenario=interrupt` points the connection at the interrupt variant of the
 * endpoint and uses a distinct chat id, so the two scenarios never share a
 * storage key.
 */

// A stable id + threadId per scenario so a reload rehydrates the SAME
// conversation from storage. UIMessage carries a `createdAt` that is not
// JSON-native, so a codec is required; a plain JSON round-trip is fine here
// because the harness only asserts on rendered text + interrupt presence.
const persistence = localStoragePersistence<ChatPersistedState>({
  serialize: (value) => JSON.stringify(value),
  deserialize: (value) => JSON.parse(value) as ChatPersistedState,
})

const textConnection = fetchServerSentEvents('/api/persistence-durability')
const interruptConnection = fetchServerSentEvents(
  '/api/persistence-durability?scenario=interrupt',
)

export const Route = createFileRoute('/persistence-durability')({
  component: PersistenceDurabilityPage,
  validateSearch: (search: Record<string, unknown>) => ({
    scenario:
      search.scenario === 'interrupt'
        ? ('interrupt' as const)
        : ('text' as const),
  }),
})

function PersistenceDurabilityPage() {
  const { scenario } = Route.useSearch()
  const isInterrupt = scenario === 'interrupt'
  const chatId = isInterrupt
    ? 'persistence-durability-interrupt'
    : 'persistence-durability-text'

  const { messages, sendMessage, isLoading, interrupts } = useChat({
    id: chatId,
    threadId: chatId,
    connection: isInterrupt ? interruptConnection : textConnection,
    persistence,
  })

  const [input, setInput] = useState('')

  const handleSubmit = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    void sendMessage(text)
  }

  return (
    <div data-testid="persistence-durability-page" style={{ padding: 16 }}>
      <div
        data-testid="interrupt-count"
        data-count={String(interrupts.length)}
        hidden
      />
      <div
        data-testid="message-count"
        data-count={String(messages.length)}
        hidden
      />

      <div data-testid="message-list">
        {messages.map((message) => (
          <div
            key={message.id}
            data-testid={
              message.role === 'user' ? 'user-message' : 'assistant-message'
            }
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

      {interrupts.map((interrupt) => (
        <div key={interrupt.id} data-testid={`interrupt-${interrupt.id}`}>
          <span data-testid="interrupt-kind">{interrupt.kind}</span>
          <span data-testid="interrupt-message">
            {interrupt.message ?? interrupt.reason}
          </span>
        </div>
      ))}

      {isLoading && <div data-testid="loading-indicator">Generating...</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          data-testid="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="Type a message..."
        />
        <button
          data-testid="send-button"
          onClick={handleSubmit}
          disabled={!input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}
