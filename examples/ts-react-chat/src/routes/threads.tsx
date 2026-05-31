import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { MessageSquare, Plus, Trash2 } from 'lucide-react'
import type { ChatClientPersistence, UIMessage } from '@tanstack/ai-client'

export const Route = createFileRoute('/threads')({
  component: ThreadsRoute,
})

// ---------------------------------------------------------------------------
// Storage layer
//
// Two concerns, two key spaces — this is the whole point of the demo:
//
//   1. Per-thread message history  → the PR's persistence adapter, keyed by the
//      ChatClient `id`. We namespace it under `THREAD_KEY_PREFIX + id` so every
//      thread is its own localStorage entry and threads never overwrite each
//      other.
//   2. The thread catalog (which threads exist, their titles, recency) → a
//      separate index the example owns. The persistence adapter is deliberately
//      single-conversation and knows nothing about "all my chats", so listing
//      and ordering threads is an app-level layer built on top.
// ---------------------------------------------------------------------------

const INDEX_KEY = 'tanstack-ai:threads'
const THREAD_KEY_PREFIX = 'tanstack-ai:thread:'
const NEW_CHAT_TITLE = 'New chat'
const TITLE_MAX = 40

interface ThreadMeta {
  id: string
  title: string
  updatedAt: number
}

const hasWindow = () => typeof window !== 'undefined'

/**
 * Per-thread history adapter. Each thread's messages live under their own
 * namespaced key, so this satisfies the PR's `ChatClientPersistence` contract
 * (get/set/remove by id) while keeping threads isolated from each other.
 */
const threadPersistence: ChatClientPersistence = {
  getItem: (id) => {
    if (!hasWindow()) return null
    const raw = window.localStorage.getItem(THREAD_KEY_PREFIX + id)
    if (!raw) return null
    // `UIMessage.createdAt` is a Date that JSON.stringify turned into a string —
    // revive it on read.
    return (JSON.parse(raw) as Array<UIMessage>).map((message) => ({
      ...message,
      createdAt:
        typeof message.createdAt === 'string'
          ? new Date(message.createdAt)
          : message.createdAt,
    }))
  },
  setItem: (id, messages) => {
    if (!hasWindow()) return
    window.localStorage.setItem(
      THREAD_KEY_PREFIX + id,
      JSON.stringify(messages),
    )
  },
  removeItem: (id) => {
    if (!hasWindow()) return
    window.localStorage.removeItem(THREAD_KEY_PREFIX + id)
  },
}

function readIndex(): Array<ThreadMeta> {
  if (!hasWindow()) return []
  try {
    const raw = window.localStorage.getItem(INDEX_KEY)
    return raw ? (JSON.parse(raw) as Array<ThreadMeta>) : []
  } catch {
    return []
  }
}

function writeIndex(threads: Array<ThreadMeta>): void {
  if (!hasWindow()) return
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(threads))
  } catch {
    // Best-effort, mirroring the persistence adapter: a full or unavailable
    // store should never break the chat.
  }
}

const byRecency = (a: ThreadMeta, b: ThreadMeta) => b.updatedAt - a.updatedAt

function truncateTitle(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > TITLE_MAX
    ? `${trimmed.slice(0, TITLE_MAX).trimEnd()}…`
    : trimmed
}

function relativeTime(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/**
 * Owns the thread catalog in localStorage. This is the layer the persistence
 * adapter doesn't provide: the list of conversations, their titles, and recency.
 */
function useThreadIndex() {
  const [threads, setThreads] = useState<Array<ThreadMeta>>([])
  // SSR-safety: the server has no localStorage, so we render an empty list and
  // load the real catalog on the client after mount. `loaded` gates bootstrap
  // logic so we don't auto-create a spurious thread before the real one loads.
  const [loaded, setLoaded] = useState(false)
  // Mirror of the catalog read synchronously by mutators. State closures are
  // stale between two calls in the same event handler (e.g. set-title then
  // bump-recency), which would make the second call clobber the first; the ref
  // is always current, so sequential mutations compose correctly.
  const threadsRef = useRef<Array<ThreadMeta>>([])

  useEffect(() => {
    const initial = readIndex().sort(byRecency)
    threadsRef.current = initial
    setThreads(initial)
    setLoaded(true)
  }, [])

  const commit = (next: Array<ThreadMeta>) => {
    const sorted = [...next].sort(byRecency)
    threadsRef.current = sorted
    setThreads(sorted)
    writeIndex(sorted)
  }

  const createThread = (): ThreadMeta => {
    const thread: ThreadMeta = {
      id: crypto.randomUUID(),
      title: NEW_CHAT_TITLE,
      updatedAt: Date.now(),
    }
    commit([thread, ...threadsRef.current])
    return thread
  }

  const deleteThread = (id: string) => {
    threadPersistence.removeItem(id)
    commit(threadsRef.current.filter((t) => t.id !== id))
  }

  /** Bump recency, and set the title the first time a thread gets one. */
  const touchThread = (id: string, title?: string) => {
    commit(
      threadsRef.current.map((t) =>
        t.id === id
          ? {
              ...t,
              updatedAt: Date.now(),
              title:
                title && t.title === NEW_CHAT_TITLE
                  ? truncateTitle(title)
                  : t.title,
            }
          : t,
      ),
    )
  }

  return { threads, loaded, createThread, deleteThread, touchThread }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

function ThreadsRoute() {
  const { threads, loaded, createThread, deleteThread, touchThread } =
    useThreadIndex()
  const [activeId, setActiveId] = useState<string | null>(null)

  // Ensure there's always an active thread: keep the current one if it still
  // exists, otherwise fall back to the most recent, otherwise create one.
  useEffect(() => {
    if (!loaded) return
    if (activeId && threads.some((t) => t.id === activeId)) return
    if (threads.length > 0) {
      setActiveId(threads[0].id)
      return
    }
    setActiveId(createThread().id)
    // `threads`/`createThread` are derived from the same state; depending on
    // `activeId` + `loaded` is enough to re-run when the active thread vanishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, activeId, threads.length])

  const handleNewChat = () => {
    // Don't pile up empty chats — if an untouched "New chat" exists, focus it.
    const empty = threads.find((t) => t.title === NEW_CHAT_TITLE)
    setActiveId(empty ? empty.id : createThread().id)
  }

  const handleDelete = (id: string) => {
    deleteThread(id)
    if (id === activeId) {
      const next = threads.find((t) => t.id !== id)
      // If nothing remains the bootstrap effect creates a fresh thread.
      setActiveId(next ? next.id : null)
    }
  }

  return (
    <div className="flex h-[calc(100vh-72px)] bg-gray-900 text-white">
      <aside className="flex w-72 flex-col border-r border-gray-800 bg-gray-950">
        <div className="p-3">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm font-medium text-orange-300 transition-colors hover:bg-orange-500/20"
          >
            <Plus size={16} />
            New chat
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {threads.length === 0 && (
            <p className="px-3 py-4 text-sm text-gray-500">No chats yet.</p>
          )}
          {threads.map((thread) => {
            const isActive = thread.id === activeId
            return (
              <div
                key={thread.id}
                className={`group mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-orange-500/15 text-orange-200'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(thread.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <MessageSquare
                    size={16}
                    className={isActive ? 'text-orange-300' : 'text-gray-500'}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{thread.title}</span>
                    <span className="block text-xs text-gray-500">
                      {relativeTime(thread.updatedAt)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(thread.id)}
                  aria-label="Delete chat"
                  className="rounded p-1 text-gray-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )
          })}
        </nav>
      </aside>

      <main className="flex flex-1 flex-col">
        {activeId ? (
          <ThreadChat
            key={activeId}
            threadId={activeId}
            onFirstMessage={(text) => touchThread(activeId, text)}
            onActivity={() => touchThread(activeId)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-gray-500">
            Loading…
          </div>
        )}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chat panel — one ChatClient per thread, hydrated from + saved to the adapter.
// Remounted via `key={threadId}` on the parent so switching threads is a clean
// swap; useChat then hydrates the newly-keyed thread's history.
// ---------------------------------------------------------------------------

function ThreadChat({
  threadId,
  onFirstMessage,
  onActivity,
}: {
  threadId: string
  onFirstMessage: (text: string) => void
  onActivity: () => void
}) {
  const { messages, sendMessage, isLoading, error } = useChat({
    id: threadId,
    connection: fetchServerSentEvents('/api/tanchat'),
    persistence: threadPersistence,
    body: { provider: 'openai', model: 'gpt-4o-mini' },
    onFinish: () => onActivity(),
  })
  const [input, setInput] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return
    if (messages.length === 0) onFirstMessage(text)
    onActivity()
    setInput('')
    void sendMessage(text)
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-6">
          {messages.length === 0 && (
            <div className="pt-16 text-center text-gray-500">
              <MessageSquare size={32} className="mx-auto mb-3 text-gray-700" />
              <p>Send a message to start this chat.</p>
              <p className="mt-1 text-sm">
                Reload the page or switch threads — it's restored from
                localStorage.
              </p>
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={message.role === 'user' ? 'text-right' : 'text-left'}
            >
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {message.role}
              </div>
              <div
                className={`inline-block max-w-full whitespace-pre-wrap rounded-2xl px-4 py-2 text-left ${
                  message.role === 'user'
                    ? 'bg-orange-500/20 text-orange-50'
                    : 'bg-gray-800 text-gray-100'
                }`}
              >
                {message.parts.map((part, i) =>
                  part.type === 'text' ? (
                    <span key={i}>{part.content}</span>
                  ) : null,
                )}
              </div>
            </div>
          ))}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
              {String(error.message ?? error)}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-800 bg-gray-900/80 px-4 py-3 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white placeholder-gray-500 focus:border-orange-500/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-orange-500 px-5 py-2 font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Sending…' : 'Send'}
          </button>
        </form>
      </div>
    </>
  )
}
