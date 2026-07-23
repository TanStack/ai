import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  fetchServerSentEvents,
  localStoragePersistence,
} from '@tanstack/ai-client'
import { useChat } from '@tanstack/ai-react'

export const Route = createFileRoute('/persistent-chat')({
  component: PersistentChatPage,
})

const connection = fetchServerSentEvents('/api/persistent-chat')

// One combined record (messages + resume snapshot) per thread, in localStorage
// so it survives a full reload and browser restart. Defaults to a JSON codec
// and the ChatPersistedState shape, so no type argument or codec is needed.
const store = localStoragePersistence()

// Client-authoritative: cache the transcript in localStorage (default).
const persistence = store

// Server-authoritative alternative — keep big histories OFF the client:
//
//   const persistence = { store, messages: false }
//
// Only the tiny resume pointer is cached, so reload still rejoins an in-flight
// run and restores interrupts, but the transcript is NOT in localStorage. Load
// history from the server instead (a router loader that fetches the GET
// `/api/persistent-chat?threadId=…` history branch and seeds `initialMessages`).

function PersistentChatPage() {
  // A stable threadId so a reload rehydrates the SAME conversation from storage
  // (client) and continues it on the server (SQLite). Persistence keys on it.
  const { messages, sendMessage, isLoading, connectionStatus } = useChat({
    threadId: 'persistent-chat',
    connection,
    persistence,
  })
  const [input, setInput] = useState(
    'Tell me a two-sentence story about a lighthouse.',
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    void sendMessage(text)
  }

  return (
    <div style={page}>
      <h1>Persistent chat</h1>
      <p style={{ color: '#555' }}>
        This chat persists on both ends. The client writes the transcript to
        <code> localStorage</code>, so a full page reload restores the
        conversation instantly. The server writes the same transcript, run
        records, and interrupt state to SQLite via{' '}
        <code>withChatPersistence</code>, so it survives a server restart too.
        Send a message, wait for the reply, then reload the page: the
        conversation is still here.
      </p>

      <div style={{ margin: '12px 0', color: '#888', fontSize: 13 }}>
        connection: <code>{connectionStatus}</code> &nbsp;|&nbsp; messages:{' '}
        <code>{messages.length}</code>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((message) => (
          <div
            key={message.id}
            style={message.role === 'user' ? userBubble : assistantBubble}
          >
            <div style={roleLabel}>{message.role}</div>
            {message.parts.map((part, index) =>
              part.type === 'text' && part.content ? (
                <p
                  key={`${message.id}-${index}`}
                  style={{ margin: 0, whiteSpace: 'pre-wrap' }}
                >
                  {part.content}
                </p>
              ) : null,
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ marginTop: 16, display: 'flex', gap: 8 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something…"
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Streaming…' : 'Send'}
        </button>
      </form>
    </div>
  )
}

const page: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: 24,
  fontFamily: 'system-ui, sans-serif',
}

const bubble: React.CSSProperties = {
  borderRadius: 8,
  padding: '10px 14px',
  maxWidth: '85%',
}

const userBubble: React.CSSProperties = {
  ...bubble,
  alignSelf: 'flex-end',
  background: '#eef2ff',
}

const assistantBubble: React.CSSProperties = {
  ...bubble,
  alignSelf: 'flex-start',
  background: '#f6f6f6',
}

const roleLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#999',
  marginBottom: 4,
}
