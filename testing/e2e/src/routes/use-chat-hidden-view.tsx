import { Activity, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

/**
 * Harness page for a `useChat` view that `<Activity>` hides and shows. The
 * toggle stays outside the Activity. `?thread=` gives each test its own thread
 * on `/api/use-chat-hidden-view`.
 */
export const Route = createFileRoute('/use-chat-hidden-view')({
  component: UseChatHiddenViewPage,
  validateSearch: (search: Record<string, unknown>) => ({
    thread:
      typeof search.thread === 'string'
        ? search.thread
        : 'use-chat-hidden-view',
  }),
})

const connection = fetchServerSentEvents('/api/use-chat-hidden-view')

function UseChatHiddenViewPage() {
  const { thread } = Route.useSearch()
  const [shown, setShown] = useState(true)

  return (
    <div style={{ padding: 16 }}>
      <button data-testid="toggle-view" onClick={() => setShown(!shown)}>
        {shown ? 'Hide chat' : 'Show chat'}
      </button>
      <Activity mode={shown ? 'visible' : 'hidden'}>
        <Chat threadId={thread} />
      </Activity>
    </div>
  )
}

function Chat({ threadId }: { threadId: string }) {
  const [input, setInput] = useState('')
  const { messages, sendMessage } = useChat({
    threadId,
    connection,
    persistence: true,
  })

  return (
    <div data-testid="use-chat-hidden-view-page">
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
                <span key={`${message.id}-${index}`}>{part.content}</span>
              ) : null,
            )}
          </div>
        ))}
      </div>
      <input
        data-testid="chat-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <button
        data-testid="send-button"
        disabled={!input.trim()}
        onClick={() => {
          void sendMessage(input.trim())
          setInput('')
        }}
      >
        Send
      </button>
    </div>
  )
}
