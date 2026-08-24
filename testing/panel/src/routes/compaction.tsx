import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { RefreshCw, RotateCcw, Send, Scissors } from 'lucide-react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import { MODEL_OPTIONS, getDefaultModelOption } from '@/lib/model-selection'
import type { ModelOption } from '@/lib/model-selection'

const THREAD_STORAGE_KEY = 'panel-compaction-thread'

// Mirror of /api/compaction-inspect. Kept local so the page has no build-time
// dependency on server internals.
interface CompactionEvent {
  before: number
  after: number
  droppedMessages: number
  summarized: boolean
  at: number
}
interface InspectResponse {
  events: Array<CompactionEvent>
}

function getMessageText(parts: UIMessage['parts']): string {
  return parts
    .filter((part) => part.type === 'text' && 'content' in part && part.content)
    .map((part) => (part as { type: 'text'; content: string }).content)
    .join('')
}

function CompactionPage() {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(
    getDefaultModelOption(),
  )
  const [threadId, setThreadId] = useState('')
  const [maxTokens, setMaxTokens] = useState(400)
  const [inspect, setInspect] = useState<InspectResponse | null>(null)
  const [input, setInput] = useState('')

  useEffect(() => {
    let existing = localStorage.getItem(THREAD_STORAGE_KEY)
    if (!existing) {
      existing = crypto.randomUUID()
      localStorage.setItem(THREAD_STORAGE_KEY, existing)
    }
    setThreadId(existing)
  }, [])

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
      threadId,
      maxTokens,
    }),
    [selectedModel.provider, selectedModel.model, threadId, maxTokens],
  )

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/compaction-chat'),
    body,
    devtools: { name: 'Compaction' },
  })

  const refreshInspect = useCallback(async () => {
    if (!threadId) return
    try {
      const res = await fetch(
        `/api/compaction-inspect?threadId=${encodeURIComponent(threadId)}`,
      )
      if (res.ok) setInspect(await res.json())
    } catch {
      // Non-fatal: read-only view.
    }
  }, [threadId])

  const wasLoading = useRef(false)
  useEffect(() => {
    if (wasLoading.current && !isLoading) refreshInspect()
    wasLoading.current = isLoading
  }, [isLoading, refreshInspect])
  useEffect(() => {
    refreshInspect()
  }, [refreshInspect])

  const startNewThread = async () => {
    if (threadId) {
      await fetch(
        `/api/compaction-inspect?threadId=${encodeURIComponent(threadId)}`,
        { method: 'DELETE' },
      ).catch(() => {})
    }
    const next = crypto.randomUUID()
    localStorage.setItem(THREAD_STORAGE_KEY, next)
    setThreadId(next)
    setInspect(null)
  }

  const submit = () => {
    const text = input.trim()
    if (!text || isLoading) return
    sendMessage(text)
    setInput('')
  }

  const events = inspect?.events ?? []

  return (
    <div className="flex h-[calc(100vh-72px)] bg-gray-900 text-white">
      {/* Left: chat */}
      <div className="flex w-1/2 flex-col border-r border-cyan-500/20">
        <div className="space-y-3 border-b border-cyan-500/20 bg-gray-800 px-4 py-3">
          <div>
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
          <div>
            <label className="mb-1 block text-sm text-gray-400">
              maxTokens (compact above this): {maxTokens}
            </label>
            <input
              type="range"
              min={100}
              max={2000}
              step={50}
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value))}
              className="w-full accent-cyan-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <p className="mt-8 text-center text-sm text-gray-500">
              Chat for a few turns. Once the running transcript passes{' '}
              {maxTokens} estimated tokens, older messages get compacted away
              and the events show up on the right.
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

      {/* Right: compaction events */}
      <div className="flex w-1/2 flex-col bg-gray-950">
        <div className="flex items-center justify-between border-b border-cyan-500/20 bg-gray-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Compaction events</h2>
            <p className="font-mono text-xs text-gray-500">
              thread: {threadId ? threadId.slice(0, 8) : '…'}
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
              onClick={startNewThread}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500/20 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-800"
            >
              <RotateCcw size={14} />
              New thread
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {events.length === 0 ? (
            <p className="mt-8 text-center text-sm text-gray-500">
              No compaction yet. Lower maxTokens or keep chatting until the
              transcript grows past the threshold.
            </p>
          ) : (
            events
              .slice()
              .reverse()
              .map((ev, i) => (
                <div
                  key={events.length - i}
                  className="rounded-lg border border-cyan-500/20 bg-gray-900 p-3"
                >
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium text-cyan-400">
                    <Scissors size={14} />
                    {ev.summarized ? 'Summarized' : 'Evicted'}{' '}
                    {ev.droppedMessages} message
                    {ev.droppedMessages === 1 ? '' : 's'}
                  </div>
                  <div className="font-mono text-xs text-gray-300">
                    {ev.before} → {ev.after} tokens (−
                    {ev.before - ev.after})
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">
                    {new Date(ev.at).toLocaleTimeString()}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/compaction')({
  component: CompactionPage,
})
