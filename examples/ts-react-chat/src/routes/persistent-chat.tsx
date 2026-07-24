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

// One SSE connection serves every thread: useChat keys persistence and the
// server GET (?threadId) on the thread id, so switching threads reuses it.
const connection = fetchServerSentEvents('/api/persistent-chat')

// Server-authoritative persistence: the client caches only resume pointers,
// never transcripts. On mount useChat hydrates a thread from the server by its
// id — the stored transcript plus a cursor to any run still generating — so
// switching threads, reloading, or opening a thread on another device all just
// resume. The server (SQLite) owns every conversation.
const persistence = { store: localStoragePersistence(), messages: false }

// The thread INDEX (which threads exist and their titles) is small app state,
// kept in localStorage. The transcripts themselves live on the server, one per
// thread id — this list is only how the UI enumerates and labels them.
const THREADS_KEY = 'persistent-chat:threads'

interface Thread {
  id: string
  title: string
}

function loadThreads(): Array<Thread> {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(THREADS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? (parsed as Array<Thread>) : []
  } catch {
    return []
  }
}

function newThread(): Thread {
  return { id: `thread-${crypto.randomUUID()}`, title: 'New chat' }
}

const SUGGESTIONS = [
  "What's the weather in Tokyo?",
  'Roll two 20-sided dice.',
  'Write a long story about a lighthouse.',
]

function formatValue(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function PersistentChatPage() {
  const [threads, setThreads] = useState<Array<Thread>>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // Load the index on the client (localStorage is not available during SSR, so
  // the first render is empty on both sides — no hydration mismatch). Start a
  // thread if there are none, so there is always an active conversation.
  useEffect(() => {
    const loaded = loadThreads()
    if (loaded.length === 0) {
      const first = newThread()
      setThreads([first])
      setActiveId(first.id)
    } else {
      setThreads(loaded)
      setActiveId(loaded[0]!.id)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(THREADS_KEY, JSON.stringify(threads))
  }, [threads, hydrated])

  const createThread = () => {
    const thread = newThread()
    setThreads((prev) => [thread, ...prev])
    setActiveId(thread.id)
  }

  // Name a thread after its first user message so the sidebar is readable.
  // A no-op (returns the same array) once the thread already has a title, so it
  // never churns state.
  const titleFromFirstMessage = (id: string, title: string) => {
    setThreads((prev) => {
      const current = prev.find((t) => t.id === id)
      if (!current || current.title !== 'New chat') return prev
      return prev.map((t) => (t.id === id ? { ...t, title } : t))
    })
  }

  return (
    <div className="pc-page">
      <aside className="pc-sidebar">
        <button type="button" className="pc-new" onClick={createThread}>
          + New chat
        </button>
        <div className="pc-threadlist">
          {threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              className={`pc-threaditem ${thread.id === activeId ? 'active' : ''}`}
              onClick={() => setActiveId(thread.id)}
            >
              {thread.title}
            </button>
          ))}
        </div>
      </aside>

      <main className="pc-main">
        {activeId ? (
          <ChatPane
            key={activeId}
            threadId={activeId}
            onFirstMessage={(text) => titleFromFirstMessage(activeId, text)}
          />
        ) : null}
      </main>
    </div>
  )
}

function ChatPane({
  threadId,
  onFirstMessage,
}: {
  threadId: string
  onFirstMessage: (text: string) => void
}) {
  // Keyed by threadId in the parent, so a fresh instance mounts per thread and
  // hydrates that thread from the server. Nothing to wire beyond threadId.
  const { messages, sendMessage, isLoading, connectionStatus } = useChat({
    threadId,
    connection,
    persistence,
  })
  const [input, setInput] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [messages])

  useEffect(() => {
    const firstUser = messages.find((m) => m.role === 'user')
    const part = firstUser?.parts.find((p) => p.type === 'text' && p.content)
    if (part && 'content' in part && part.content) {
      onFirstMessage(part.content.slice(0, 40))
    }
  }, [messages, onFirstMessage])

  const send = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return
    setInput('')
    void sendMessage(trimmed)
  }

  return (
    <>
      <div className="pc-header">
        <h1>Persistent chat</h1>
        <span className="pc-status">
          <span className={`pc-dot ${connectionStatus}`} />
          {connectionStatus}
        </span>
      </div>

      <p className="pc-blurb">
        The server owns every conversation (transcript, runs, interrupts, tool
        calls) in SQLite via <code>withPersistence</code>. The client caches
        only a resume pointer (<code>messages: false</code>); on mount{' '}
        <code>useChat</code> hydrates this thread from the server by its id — no
        loader, no props. Start a long reply, then switch threads or reload: it
        resumes exactly where it was.
      </p>

      <div className="pc-thread" ref={threadRef}>
        {messages.length === 0 ? (
          <p className="pc-empty">
            No messages yet — try a suggestion below, then reload or switch
            threads to see it resume.
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
    </>
  )
}
