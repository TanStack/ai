import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import {
  fetchServerSentEvents,
  localStoragePersistence,
} from '@tanstack/ai-client'
import { useChat } from '@tanstack/ai-react'
import { loadPersistentChatHistoryFn } from '../lib/server-fns'
import './persistent-chat.css'

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
  // The loader hydrated the transcript from the server (server owns history),
  // and reports whether a run is still generating for this thread.
  const { messages: initialMessages, activeRunId } = Route.useLoaderData()

  // A stable threadId so a reload continues the SAME conversation: the server
  // keys its stored thread on it, and the client keys its resume pointer on it.
  const { messages, sendMessage, isLoading, connectionStatus } = useChat({
    threadId: THREAD_ID,
    connection,
    persistence,
    initialMessages,
    // If the server says a run is in flight, tail it — even on a fresh client
    // (a second device/browser) that has no local resume pointer. A client that
    // started the run already rejoins via its own persisted pointer; this covers
    // the one that didn't. Harmless once the run finishes (join fast-fails and
    // the hydrated transcript already holds the complete reply).
    ...(activeRunId && {
      initialResumeSnapshot: {
        schemaVersion: 2,
        resumeState: { threadId: THREAD_ID, runId: activeRunId },
      },
    }),
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
