import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { useChat } from '@tanstack/ai-react'

export const Route = createFileRoute('/resumable')({
  component: ResumablePage,
})

// A durable connection. The /api/resumable route records every chunk to a
// durability log (see its POST handler) and exposes a GET replay handler, so a
// dropped or rolled-over connection reconnects and resumes the same response
// automatically. Nothing on the client opts in beyond using useChat with it.
const connection = fetchServerSentEvents('/api/resumable')

function ResumablePage() {
  const { messages, sendMessage, isLoading, connectionStatus } = useChat({
    connection,
  })
  const [input, setInput] = useState(
    'Write a short haiku about durable streams.',
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
      <h1>Resumable streams</h1>
      <p style={{ color: '#555' }}>
        This chat talks to a durability-backed endpoint. Because the server
        records each chunk and exposes a GET replay handler, a dropped or
        rolled-over connection reconnects and resumes the same response
        automatically, with no client code beyond <code>useChat</code>. Send a
        message, then kill the network for a moment: the stream picks up where
        it left off instead of restarting the model.
      </p>

      <div style={{ margin: '12px 0', color: '#888', fontSize: 13 }}>
        connection: <code>{connectionStatus}</code>
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
