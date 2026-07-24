import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  fetchServerSentEvents,
  localStoragePersistence,
  useChat,
} from '@tanstack/ai-react'

/**
 * Browser-refresh persistence harness (client half).
 *
 * A `localStoragePersistence` adapter stores ONE combined `{ messages, resume }`
 * record per thread, so a full `page.reload()` restores the conversation — and
 * any pending-interrupt resume snapshot — straight from `localStorage`, with no
 * server round-trip. The matching provider-free durable endpoint is
 * `/api/persistence-durability`.
 *
 * `?scenario=interrupt` points the connection at the interrupt variant of the
 * endpoint and uses a distinct threadId, so the two scenarios never share a
 * storage key.
 *
 * `?scenario=server-interrupt` is the SERVER-authoritative counterpart: the
 * client runs `messages: false` (caches no transcript, only a resume pointer),
 * so on mount it hydrates from the endpoint's GET, which returns a pending
 * interrupt. Proves a fresh client re-prompts the approval from the server, not
 * from `localStorage`.
 */

// The store instance both modes share. `text`/`interrupt` pass it directly
// (messages:true default — transcript cached to localStorage). `server-interrupt`
// wraps it with `messages: false`, so the server owns the transcript and the
// client hydrates on mount.
const store = localStoragePersistence()

const textConnection = fetchServerSentEvents('/api/persistence-durability')
const interruptConnection = fetchServerSentEvents(
  '/api/persistence-durability?scenario=interrupt',
)
const serverInterruptConnection = fetchServerSentEvents(
  '/api/persistence-durability?scenario=server-interrupt',
)

export const Route = createFileRoute('/persistence-durability')({
  component: PersistenceDurabilityPage,
  validateSearch: (search: Record<string, unknown>) => ({
    scenario:
      search.scenario === 'interrupt'
        ? ('interrupt' as const)
        : search.scenario === 'server-interrupt'
          ? ('server-interrupt' as const)
          : ('text' as const),
  }),
})

function PersistenceDurabilityPage() {
  const { scenario } = Route.useSearch()
  const isInterrupt = scenario === 'interrupt'
  const isServerInterrupt = scenario === 'server-interrupt'
  const chatId = isServerInterrupt
    ? 'persistence-durability-server-interrupt'
    : isInterrupt
      ? 'persistence-durability-interrupt'
      : 'persistence-durability-text'

  const { messages, sendMessage, isLoading, interrupts } = useChat({
    // The threadId IS the hook's identity and its persistence key, so the
    // localStorage record lives under `tanstack-ai:<chatId>` and a reload with
    // the same threadId restores it.
    threadId: chatId,
    connection: isServerInterrupt
      ? serverInterruptConnection
      : isInterrupt
        ? interruptConnection
        : textConnection,
    persistence: isServerInterrupt ? { store, messages: false } : store,
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
          <span
            data-testid="interrupt-can-resolve"
            data-can-resolve={String(interrupt.canResolve)}
          >
            {String(interrupt.canResolve)}
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
