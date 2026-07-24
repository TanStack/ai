import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import {
  fetchServerSentEvents,
  localStoragePersistence,
} from '@tanstack/ai-client'
import { useChat } from '@tanstack/ai-react'
import './persistent-chat.css'

export const Route = createFileRoute('/persistent-chat')({
  component: PersistentChatPage,
})

const connection = fetchServerSentEvents('/api/persistent-chat')

const THREAD_ID = 'persistent-chat'

// Recommended setup: server-authoritative persistence. The client caches ONLY
// the resume pointer (which interrupts are pending) in localStorage — never the
// transcript. On mount `useChat` hits the GET endpoint itself (keyed by
// threadId) to hydrate the transcript AND tail any in-flight run — no loader, no
// initialMessages, no hydration prop. Large histories stay off the client and
// the server (SQLite) owns the conversation.
const persistence = { store: localStoragePersistence(), messages: false }

const SUGGESTIONS = [
  "What's the weather in Tokyo?",
  'Roll two 20-sided dice.',
  'Tell me a two-sentence story about a lighthouse.',
]

function formatValue(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function PersistentChatPage() {
  // A stable threadId so a reload — or the same thread opened on another device
  // — continues the SAME conversation. `useChat` hydrates itself from the server
  // on mount by threadId: it paints the stored transcript and tails any run
  // still generating. Nothing to wire here beyond the threadId and connection.
  const { messages, sendMessage, isLoading, connectionStatus } = useChat({
    threadId: THREAD_ID,
    connection,
    persistence,
  })
  const [input, setInput] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)

  // Keep the latest message in view as the conversation grows / streams.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [messages])

  const send = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return
    setInput('')
    void sendMessage(trimmed)
  }

  return (
    <div className="pc-page">
      <div className="pc-header">
        <h1>Persistent chat</h1>
        <span className="pc-status">
          <span className={`pc-dot ${connectionStatus}`} />
          {connectionStatus}
        </span>
      </div>

      <p className="pc-blurb">
        Server-authoritative persistence: the server owns the conversation
        (transcript, runs, interrupts, and tool calls) in SQLite via{' '}
        <code>withPersistence</code>, and the page loader hydrates it on load.
        The client caches only the resume pointer (<code>messages: false</code>)
        — no transcript in the browser. Ask for the weather or a dice roll to
        exercise server tools, then reload: everything comes back from the
        server.
      </p>

      <div className="pc-thread" ref={threadRef}>
        {messages.length === 0 ? (
          <p className="pc-empty">
            No messages yet — try a suggestion below, then reload the page.
          </p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`pc-row ${message.role}`}>
              <span className="pc-role">{message.role}</span>
              {message.parts.map((part, index) => {
                const key = `${message.id}-${index}`
                if (part.type === 'text' && part.content) {
                  return (
                    <div key={key} className="pc-bubble">
                      {part.content}
                    </div>
                  )
                }
                if (part.type === 'tool-call') {
                  const args = part.input ?? part.arguments
                  return (
                    <div key={key} className="pc-tool">
                      <div className="pc-tool-head">🔧 {part.name}</div>
                      {formatValue(args) ? (
                        <pre className="pc-tool-io">{formatValue(args)}</pre>
                      ) : null}
                      {part.output !== undefined ? (
                        <pre className="pc-tool-io">
                          {formatValue(part.output)}
                        </pre>
                      ) : (
                        <div className="pc-tool-pending">running…</div>
                      )}
                    </div>
                  )
                }
                return null
              })}
            </div>
          ))
        )}
      </div>

      <div className="pc-composer">
        <div style={{ flex: 1 }}>
          {messages.length === 0 ? (
            <div className="pc-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="pc-chip"
                  onClick={() => send(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            style={{ display: 'flex', gap: 10 }}
          >
            <input
              className="pc-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about the weather, roll some dice…"
            />
            <button className="pc-send" type="submit" disabled={isLoading}>
              {isLoading ? 'Streaming…' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
