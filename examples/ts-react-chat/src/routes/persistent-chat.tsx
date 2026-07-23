import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  fetchServerSentEvents,
  localStoragePersistence,
} from '@tanstack/ai-client'
import { useChat } from '@tanstack/ai-react'
import { loadPersistentChatHistoryFn } from '../lib/server-fns'

export const Route = createFileRoute('/persistent-chat')({
  // Server-authoritative history: the client caches no transcript, so hydrate
  // it from the server on load. Works during SSR (the server fn reads the store
  // directly — no relative fetch that would fail without an origin).
  loader: () => loadPersistentChatHistoryFn(),
  component: PersistentChatPage,
})

const connection = fetchServerSentEvents('/api/persistent-chat')

const THREAD_ID = 'persistent-chat'

// Recommended setup: server-authoritative persistence. The client caches ONLY
// the resume pointer (which run to rejoin, which interrupts are pending) in
// localStorage — never the transcript. So a reload still rejoins an in-flight
// run and restores interrupts, but large histories stay off the client and the
// server (SQLite) owns the conversation. `localStoragePersistence()` defaults
// to a JSON codec and the ChatPersistedState shape, so no type arg or codec.
const persistence = { store: localStoragePersistence(), messages: false }

function PersistentChatPage() {
  // The loader hydrated the transcript from the server (server owns history).
  const initialMessages = Route.useLoaderData()

  // A stable threadId so a reload continues the SAME conversation: the server
  // keys its stored thread on it, and the client keys its resume pointer on it.
  const { messages, sendMessage, isLoading, connectionStatus } = useChat({
    threadId: THREAD_ID,
    connection,
    persistence,
    initialMessages,
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
        The recommended, server-authoritative setup. The server owns the
        conversation: it writes the transcript, run records, and interrupt state
        to SQLite via <code>withPersistence</code>, and the page loader hydrates
        history from it on load. The client caches only the tiny resume pointer
        in <code>localStorage</code> (<code>{'{ messages: false }'}</code>) — no
        transcript in the browser — so a reload still rejoins an in-flight run
        and restores interrupts. Send a message, wait for the reply, then
        reload: the conversation is restored from the server, not from your
        browser.
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
