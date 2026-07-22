import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { RefreshCw, RotateCcw, Send } from 'lucide-react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import { MODEL_OPTIONS, getDefaultModelOption } from '@/lib/model-selection'
import type { ModelOption } from '@/lib/model-selection'

const SESSION_STORAGE_KEY = 'panel-memory-session'

// Shapes returned by /api/memory-inspect. These mirror the `inMemory()`
// snapshot payload + the RecallResult contract; kept local so the page has no
// build-time dependency on server internals.
interface RecordRow {
  id: string
  text: string
  kind: string
  role?: 'user' | 'assistant'
  createdAt: number
  importance?: number
}
interface FactRow {
  id: string
  text: string
  source?: string
  createdAt?: string
}
interface Fragment {
  text: string
  source: string
}
interface LastRecall {
  systemPrompt: string
  fragments?: Array<Fragment>
  toolGuidance?: string
}
interface InspectResponse {
  snapshot: { takenAt: string; data: { records?: Array<RecordRow> } } | null
  facts: Array<FactRow>
  lastRecall: LastRecall | null
}

function getMessageText(parts: UIMessage['parts']): string {
  return parts
    .filter((part) => part.type === 'text' && 'content' in part && part.content)
    .map((part) => (part as { type: 'text'; content: string }).content)
    .join('')
}

function formatTime(value: number | string | undefined): string {
  if (value === undefined) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString()
}

function MemoryPage() {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(
    getDefaultModelOption(),
  )
  const [sessionId, setSessionId] = useState('')
  const [inspect, setInspect] = useState<InspectResponse | null>(null)
  const [input, setInput] = useState('')

  // Resolve (or create) a stable session id, persisted so memory survives reloads.
  useEffect(() => {
    let existing = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!existing) {
      existing = crypto.randomUUID()
      localStorage.setItem(SESSION_STORAGE_KEY, existing)
    }
    setSessionId(existing)
  }, [])

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
      sessionId,
    }),
    [selectedModel.provider, selectedModel.model, sessionId],
  )

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/memory-chat'),
    body,
    devtools: { name: 'Memory' },
  })

  const refreshInspect = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await fetch(
        `/api/memory-inspect?sessionId=${encodeURIComponent(sessionId)}`,
      )
      if (res.ok) setInspect(await res.json())
    } catch {
      // Non-fatal: the inspector is a read-only view; leave the last snapshot.
    }
  }, [sessionId])

  // Refresh the inspector whenever the session changes and each time a turn
  // finishes (isLoading falls back to false).
  const wasLoading = useRef(false)
  useEffect(() => {
    if (wasLoading.current && !isLoading) refreshInspect()
    wasLoading.current = isLoading
  }, [isLoading, refreshInspect])
  useEffect(() => {
    refreshInspect()
  }, [refreshInspect])

  const startNewSession = () => {
    const next = crypto.randomUUID()
    localStorage.setItem(SESSION_STORAGE_KEY, next)
    setSessionId(next)
    setInspect(null)
  }

  const submit = () => {
    const text = input.trim()
    if (!text || isLoading) return
    sendMessage(text)
    setInput('')
  }

  const records = inspect?.snapshot?.data.records ?? []
  const facts = inspect?.facts ?? []
  const lastRecall = inspect?.lastRecall ?? null

  return (
    <div className="flex h-[calc(100vh-72px)] bg-gray-900 text-white">
      {/* Left: chat */}
      <div className="flex w-1/2 flex-col border-r border-cyan-500/20">
        <div className="border-b border-cyan-500/20 bg-gray-800 px-4 py-3">
          <label className="mb-2 block text-sm text-gray-400">
            Select Model:
          </label>
          <select
            value={MODEL_OPTIONS.findIndex(
              (opt) =>
                opt.provider === selectedModel.provider &&
                opt.model === selectedModel.model,
            )}
            onChange={(e) =>
              setSelectedModel(MODEL_OPTIONS[parseInt(e.target.value)])
            }
            disabled={isLoading}
            className="w-full rounded-lg border border-cyan-500/20 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50"
          >
            {MODEL_OPTIONS.map((option, index) => (
              <option key={index} value={index}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <p className="mt-8 text-center text-sm text-gray-500">
              Say something like "My name is Jack and I love guitars", then in a
              later turn ask "What's my name?" — the answer comes from memory.
            </p>
          ) : (
            messages.map(({ id, role, parts }) => (
              <div
                key={id}
                className={`mb-3 flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                    role === 'user'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-gray-800 text-gray-100'
                  }`}
                >
                  {getMessageText(parts)}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-cyan-500/10 bg-gray-900/80 px-4 py-3">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder="Type a message…"
              disabled={isLoading}
              className="flex-1 rounded-lg border border-cyan-500/20 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50"
            />
            <button
              onClick={submit}
              disabled={!input.trim() || isLoading}
              className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700 disabled:opacity-50"
            >
              <Send size={16} />
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Right: memory inspector */}
      <div className="flex w-1/2 flex-col bg-gray-950">
        <div className="flex items-center justify-between border-b border-cyan-500/20 bg-gray-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">What's in memory</h2>
            <p className="font-mono text-xs text-gray-500">
              session: {sessionId ? sessionId.slice(0, 8) : '…'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={refreshInspect}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500/20 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-800"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              onClick={startNewSession}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500/20 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-800"
            >
              <RotateCcw size={14} />
              New session
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {/* Last recalled */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
              Last recalled (injected into the prompt)
            </h3>
            {lastRecall && lastRecall.systemPrompt ? (
              <div className="space-y-2">
                <pre className="whitespace-pre-wrap rounded-lg border border-gray-800 bg-gray-900 p-3 text-xs text-gray-200">
                  {lastRecall.systemPrompt}
                </pre>
                {lastRecall.fragments && lastRecall.fragments.length > 0 && (
                  <ul className="space-y-1">
                    {lastRecall.fragments.map((frag, i) => (
                      <li
                        key={i}
                        className="rounded border border-gray-800 bg-gray-900 px-2 py-1 text-xs text-gray-300"
                      >
                        <span className="text-gray-500">{frag.source}:</span>{' '}
                        {frag.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-600">
                Nothing recalled yet — send a follow-up question that relates to
                an earlier message.
              </p>
            )}
          </section>

          {/* Records */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
              Stored records ({records.length})
            </h3>
            {records.length === 0 ? (
              <p className="text-xs text-gray-600">
                No memories yet — send a message to store the first turn.
              </p>
            ) : (
              <ul className="space-y-2">
                {records.map((rec) => (
                  <li
                    key={rec.id}
                    className="rounded-lg border border-gray-800 bg-gray-900 p-3"
                  >
                    <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                      <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300">
                        {rec.kind}
                      </span>
                      {rec.role && <span>{rec.role}</span>}
                      {rec.importance !== undefined && (
                        <span>importance {rec.importance.toFixed(2)}</span>
                      )}
                      <span className="ml-auto">
                        {formatTime(rec.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-100">{rec.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Facts */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
              listFacts() ({facts.length})
            </h3>
            {facts.length === 0 ? (
              <p className="text-xs text-gray-600">No facts.</p>
            ) : (
              <ul className="space-y-1">
                {facts.map((fact) => (
                  <li
                    key={fact.id}
                    className="rounded border border-gray-800 bg-gray-900 px-2 py-1 text-xs text-gray-300"
                  >
                    {fact.source && (
                      <span className="text-gray-500">{fact.source}: </span>
                    )}
                    {fact.text}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/memory')({
  component: MemoryPage,
})
