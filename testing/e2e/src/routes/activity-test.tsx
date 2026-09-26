import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

/**
 * Harness page for AG-UI activity. `/api/activity-test` yields live
 * ACTIVITY_SNAPSHOT / ACTIVITY_DELTA (default) or a MESSAGES_SNAPSHOT that
 * already contains an ActivityMessage (`?mode=snapshot`).
 */
export const Route = createFileRoute('/activity-test')({
  component: ActivityTestPage,
  validateSearch: (search: Record<string, unknown>) => ({
    mode:
      search.mode === 'snapshot' ? ('snapshot' as const) : ('live' as const),
  }),
})

function ActivityTestPage() {
  const { mode } = Route.useSearch()
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading } = useChat({
    threadId: mode === 'snapshot' ? 'activity-snapshot' : 'activity-live',
    connection: fetchServerSentEvents(
      mode === 'snapshot'
        ? '/api/activity-test?mode=snapshot'
        : '/api/activity-test',
    ),
  })

  const handleSubmit = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    void sendMessage(text)
  }

  return (
    <div data-testid="activity-test-page" style={{ padding: 16 }}>
      <div data-testid="message-list">
        {messages.map((message) => {
          if (message.role === 'activity') {
            const part = message.parts[0]
            const content =
              part && part.type === 'activity'
                ? JSON.stringify(part.content)
                : ''
            const activityType =
              part && part.type === 'activity' ? part.activityType : ''
            return (
              <div
                key={message.id}
                data-testid="activity-message"
                data-activity-id={message.id}
                data-activity-type={activityType}
              >
                <span data-testid="activity-content">{content}</span>
              </div>
            )
          }
          return (
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
          )
        })}
      </div>

      {isLoading && <div data-testid="loading-indicator">Generating...</div>}

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
          placeholder="Type a message..."
        />
        <button
          data-testid="send-button"
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}
