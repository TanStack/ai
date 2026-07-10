import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { localStoragePersistence } from '@tanstack/ai-client'
import { Square } from 'lucide-react'
import type { ChatResumeSnapshot, UIMessage } from '@tanstack/ai-client'

const THREAD_ID_KEY = 'tanstack-ai:sqlite-persistence:thread-id'
const RESUME_KEY_PREFIX = 'tanstack-ai:sqlite-persistence:resume:'
const MESSAGES_KEY_PREFIX = 'tanstack-ai:sqlite-persistence:messages:'

type StoredUIMessage = Omit<UIMessage, 'createdAt'> & {
  createdAt?: Date | string
}

function isStoredUIMessage(value: unknown): value is StoredUIMessage {
  return (
    value !== null &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string' &&
    'role' in value &&
    (value.role === 'system' ||
      value.role === 'user' ||
      value.role === 'assistant') &&
    'parts' in value &&
    Array.isArray(value.parts) &&
    (!('createdAt' in value) ||
      value.createdAt instanceof Date ||
      typeof value.createdAt === 'string')
  )
}

function serializeJson(value: unknown): string {
  const stringify: (input: unknown) => unknown = JSON.stringify
  const serialized = stringify(value)
  if (typeof serialized !== 'string') {
    throw new TypeError('The persistence value is not JSON serializable')
  }
  return serialized
}

function deserializeMessages(raw: string): Array<UIMessage> {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed) || !parsed.every(isStoredUIMessage)) {
    throw new TypeError('Stored messages are invalid')
  }
  return parsed.map(({ createdAt, ...message }) => ({
    ...message,
    ...(createdAt
      ? {
          createdAt:
            createdAt instanceof Date ? createdAt : new Date(createdAt),
        }
      : {}),
  }))
}

function getStableThreadId(): string {
  if (typeof window === 'undefined') return 'sqlite-persistence-ssr'
  const existing = window.localStorage.getItem(THREAD_ID_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  window.localStorage.setItem(THREAD_ID_KEY, id)
  return id
}

const messagePersistence = localStoragePersistence<Array<UIMessage>>({
  keyPrefix: MESSAGES_KEY_PREFIX,
  serialize: serializeJson,
  deserialize: deserializeMessages,
})

const resumePersistence = localStoragePersistence<ChatResumeSnapshot>({
  keyPrefix: RESUME_KEY_PREFIX,
  serialize: serializeJson,
  deserialize: JSON.parse,
})

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

function SqlitePersistenceRoute() {
  const [threadId] = useState(getStableThreadId)
  const [input, setInput] = useState('')

  const { messages, sendMessage, isLoading, error, resumeState, stop, clear } =
    useChat({
      id: threadId,
      threadId,
      connection: fetchServerSentEvents('/api/sqlite-persistent-chat'),
      persistence: {
        client: messagePersistence,
        server: resumePersistence,
      },
    })

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
    resumePersistence.removeItem(threadId)
    window.localStorage.removeItem(THREAD_ID_KEY)
    window.location.reload()
  }

  return (
    <div className="flex h-[calc(100vh-72px)] flex-col bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-950 px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Persistent chat</h1>
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
              Send a prompt and wait for it to finish, then refresh to hydrate
              the same thread from browser and SQLite state. During an active
              request, the process-local delivery log can replay a transiently
              dropped SSE connection.
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
            placeholder="Ask for a detailed answer, then refresh after it completes"
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

export const Route = createFileRoute('/sqlite-persistence')({
  component: SqlitePersistenceRoute,
})
