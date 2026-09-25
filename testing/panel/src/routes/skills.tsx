import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { RefreshCw, RotateCcw, Send } from 'lucide-react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import { MODEL_OPTIONS, getDefaultModelOption } from '@/lib/model-selection'
import type { ModelOption } from '@/lib/model-selection'

const THREAD_STORAGE_KEY = 'panel-skills-thread'

interface CatalogSkill {
  name: string
  description: string
}
interface InspectResponse {
  catalog: Array<CatalogSkill>
  activated: Array<string>
}

function getMessageText(parts: UIMessage['parts']): string {
  return parts
    .filter((part) => part.type === 'text' && 'content' in part && part.content)
    .map((part) => (part as { type: 'text'; content: string }).content)
    .join('')
}

function SkillsPage() {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(
    getDefaultModelOption(),
  )
  const [threadId, setThreadId] = useState('')
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
    }),
    [selectedModel.provider, selectedModel.model, threadId],
  )

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/skills-chat'),
    body,
    devtools: { name: 'Skills' },
  })

  const refreshInspect = useCallback(async () => {
    if (!threadId) return
    try {
      const res = await fetch(
        `/api/skills-inspect?threadId=${encodeURIComponent(threadId)}`,
      )
      if (res.ok) setInspect(await res.json())
    } catch {
      // Non-fatal: leave the last snapshot.
    }
  }, [threadId])

  // Refresh the catalog on load and each time a turn finishes.
  const wasLoading = useRef(false)
  useEffect(() => {
    if (wasLoading.current && !isLoading) refreshInspect()
    wasLoading.current = isLoading
  }, [isLoading, refreshInspect])
  useEffect(() => {
    refreshInspect()
  }, [refreshInspect])

  const startNewThread = () => {
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

  const catalog = inspect?.catalog ?? []
  const activated = new Set(inspect?.activated ?? [])

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
              Try "Explain how a rainbow forms, like a pirate" or "Answer as a
              haiku: what is TypeScript?" — watch the model load a skill on the
              right before it answers.
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

      {/* Right: skill catalog */}
      <div className="flex w-1/2 flex-col bg-gray-950">
        <div className="flex items-center justify-between border-b border-cyan-500/20 bg-gray-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Skill catalog</h2>
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
          <p className="text-xs text-gray-500">
            These skills are read from the demo <code>skills/</code> folder and
            offered to the model as a catalog. A skill lights up once the model
            loads it with <code>load_skill</code>.
          </p>
          {catalog.length === 0 ? (
            <p className="text-xs text-gray-600">No skills found.</p>
          ) : (
            <ul className="space-y-2">
              {catalog.map((skill) => {
                const isActive = activated.has(skill.name)
                return (
                  <li
                    key={skill.name}
                    className={`rounded-lg border p-3 ${
                      isActive
                        ? 'border-cyan-500/50 bg-cyan-500/10'
                        : 'border-gray-800 bg-gray-900'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-mono text-sm text-cyan-300">
                        {skill.name}
                      </span>
                      {isActive && (
                        <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-xs text-cyan-300">
                          loaded
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-300">{skill.description}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/skills')({
  component: SkillsPage,
})
