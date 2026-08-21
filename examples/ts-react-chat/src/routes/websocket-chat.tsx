import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useChat, webSocket } from '@tanstack/ai-react'

export const Route = createFileRoute('/websocket-chat')({
  component: WebSocketChatPage,
})

// A full-duplex WebSocket connection. `/api/chat-ws` (see
// `src/lib/websocket-chat-plugin.ts`) records every chunk to a durability
// log and serves `?offset=` resumes over the same socket protocol, so a
// dropped connection reconnects and resumes automatically — nothing on the
// client opts in beyond using `useChat` with `webSocket()`.
const connection = webSocket('/api/chat-ws')

function WebSocketChatPage() {
  const { messages, sendMessage, isLoading, connectionStatus } = useChat({
    connection,
  })
  const [input, setInput] = useState('Write a short haiku about WebSockets.')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    void sendMessage(text)
  }

  return (
    <div style={page}>
      <h1>WebSocket chat</h1>
      <p style={{ color: '#555' }}>
        This chat talks to the model over a single full-duplex WebSocket instead
        of HTTP/SSE. The server durably logs each chunk, so a dropped connection
        reconnects with <code>?offset=</code> and resumes the run rather than
        restarting the model — all through <code>useChat</code> with the{' '}
        <code>webSocket()</code> connection adapter.
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
