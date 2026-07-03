import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { Square } from 'lucide-react'
import type {
  ChatClientPersistence,
  ChatPendingInterrupt,
  ChatResumeSnapshot,
  UIMessage,
} from '@tanstack/ai-client'

const THREAD_ID_KEY = 'tanstack-ai:mysql-persistence:thread-id'
const RESUME_KEY_PREFIX = 'tanstack-ai:mysql-persistence:resume:'
const MESSAGES_KEY_PREFIX = 'tanstack-ai:mysql-persistence:messages:'

function getStableThreadId(): string {
  if (typeof window === 'undefined') return 'mysql-persistence-ssr'
  const existing = window.localStorage.getItem(THREAD_ID_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  window.localStorage.setItem(THREAD_ID_KEY, id)
  return id
}

function parsePendingInterrupts(value: unknown): Array<ChatPendingInterrupt> {
  if (!Array.isArray(value)) return []
  const interrupts: Array<ChatPendingInterrupt> = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (typeof record.id !== 'string' || typeof record.reason !== 'string') {
      continue
    }
    const pendingInterrupt: ChatPendingInterrupt = {
      id: record.id,
      reason: record.reason,
      ...(typeof record.toolCallId === 'string'
        ? { toolCallId: record.toolCallId }
        : {}),
    }
    if (
      record.metadata &&
      typeof record.metadata === 'object' &&
      !Array.isArray(record.metadata)
    ) {
      pendingInterrupt.metadata = record.metadata as Record<string, unknown>
    }
    interrupts.push(pendingInterrupt)
  }
  return interrupts
}

function parseStoredResumeSnapshot(
  raw: string | null,
): ChatResumeSnapshot | null {
  if (!raw) return null
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object') return null
  const value = parsed as Record<string, unknown>
  const resumeState =
    value.resumeState && typeof value.resumeState === 'object'
      ? (value.resumeState as Record<string, unknown>)
      : value
  if (
    typeof resumeState.threadId !== 'string' ||
    typeof resumeState.runId !== 'string' ||
    typeof resumeState.cursor !== 'string'
  ) {
    return null
  }
  return {
    resumeState: {
      threadId: resumeState.threadId,
      runId: resumeState.runId,
      cursor: resumeState.cursor,
    },
    pendingInterrupts: parsePendingInterrupts(value.pendingInterrupts),
  }
}

const messagePersistence: ChatClientPersistence = {
  getItem(id) {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(MESSAGES_KEY_PREFIX + id)
    if (!raw) return null
    return (JSON.parse(raw) as Array<UIMessage>).map((message) => ({
      ...message,
      createdAt:
        typeof message.createdAt === 'string'
          ? new Date(message.createdAt)
          : message.createdAt,
    }))
  },
  setItem(id, messages) {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      MESSAGES_KEY_PREFIX + id,
      JSON.stringify(messages),
    )
  },
  removeItem(id) {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(MESSAGES_KEY_PREFIX + id)
  },
}

function messageText(message: UIMessage): string {
  return message.parts
    .map((part) => {
      if (part.type === 'text') return part.content
      if (part.type === 'thinking') return part.content
      if (part.type === 'tool-call') return `[tool:${part.name}]`
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function MysqlPersistenceRoute() {
  const [threadId] = useState(getStableThreadId)
  const resumeStorageKey = useMemo(
    () => RESUME_KEY_PREFIX + threadId,
    [threadId],
  )
  const attemptedStoredResumeRef = useRef(false)
  const [initialResumeSnapshot] = useState<ChatResumeSnapshot | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return parseStoredResumeSnapshot(
        window.localStorage.getItem(RESUME_KEY_PREFIX + getStableThreadId()),
      )
    } catch {
      window.localStorage.removeItem(RESUME_KEY_PREFIX + getStableThreadId())
      return null
    }
  })
  const [input, setInput] = useState('')

  const {
    messages,
    sendMessage,
    isLoading,
    error,
    resumeState,
    pendingInterrupts,
    resume,
    stop,
    clear,
  } = useChat({
    id: threadId,
    threadId,
    connection: fetchServerSentEvents('/api/mysql-persistent-chat'),
    persistence: messagePersistence,
    ...(initialResumeSnapshot ? { initialResumeSnapshot } : {}),
  })

  useEffect(() => {
    if (attemptedStoredResumeRef.current) return
    attemptedStoredResumeRef.current = true
    if (!initialResumeSnapshot) return
    if ((initialResumeSnapshot.pendingInterrupts ?? []).length > 0) return
    try {
      void resume(initialResumeSnapshot.resumeState)
    } catch {
      window.localStorage.removeItem(resumeStorageKey)
    }
  }, [initialResumeSnapshot, resume, resumeStorageKey])

  useEffect(() => {
    if (!attemptedStoredResumeRef.current) return
    if (resumeState) {
      const snapshot: ChatResumeSnapshot = {
        resumeState,
        pendingInterrupts,
      }
      window.localStorage.setItem(resumeStorageKey, JSON.stringify(snapshot))
    } else {
      window.localStorage.removeItem(resumeStorageKey)
    }
  }, [pendingInterrupts, resumeState, resumeStorageKey])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    void sendMessage(text)
  }

  const handleReset = () => {
    clear()
    messagePersistence.removeItem(threadId)
    window.localStorage.removeItem(resumeStorageKey)
    window.localStorage.removeItem(THREAD_ID_KEY)
    window.location.reload()
  }

  return (
    <div className="flex h-[calc(100vh-72px)] flex-col bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-950 px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">MySQL persistent chat</h1>
            <p className="text-sm text-gray-400">
              Thread {threadId.slice(0, 8)}
              {resumeState ? ` · run ${resumeState.runId.slice(0, 8)}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-800"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.length === 0 && (
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-6 text-gray-400">
              Send a prompt, then refresh while the response is streaming. The
              same server process continues tailing persisted MySQL events from
              the saved run cursor.
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-lg px-4 py-3 ${
                message.role === 'user'
                  ? 'ml-auto max-w-2xl bg-orange-500/20'
                  : 'mr-auto max-w-2xl bg-gray-800'
              }`}
            >
              <div className="mb-2 text-xs font-semibold uppercase text-gray-500">
                {message.role}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-6">
                {messageText(message)}
              </div>
            </div>
          ))}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error.message}
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-800 bg-gray-950 px-4 py-3"
      >
        <div className="mx-auto flex max-w-3xl gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask for a detailed answer, then refresh mid-stream"
            className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white placeholder-gray-500 focus:border-orange-500/50 focus:outline-none"
          />
          {isLoading ? (
            <button
              type="button"
              onClick={() => void stop()}
              className="flex items-center gap-2 rounded-lg bg-gray-700 px-5 py-2 font-medium text-white transition-colors hover:bg-gray-600"
            >
              <Square size={16} />
              Stop
            </button>
          ) : (
            <button
              type="submit"
              className="rounded-lg bg-orange-500 px-5 py-2 font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
              disabled={!input.trim()}
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

export const Route = createFileRoute('/mysql-persistence')({
  component: MysqlPersistenceRoute,
})
