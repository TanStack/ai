import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Send, Scissors } from 'lucide-react'
import { fetchServerSentEvents, useByok, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import type { ProviderId } from '@tanstack/ai/byok'
import { ByokKeyDialog } from '@/components/ByokKeyDialog'
import { byok, getEnvKeyStatus, toByokProvider } from '@/lib/byok'
import { DEFAULT_MODEL_OPTION, MODEL_OPTIONS } from '@/lib/model-selection'
import type { ModelOption } from '@/lib/model-selection'

function getMessageText(parts: UIMessage['parts']): string {
  return parts
    .filter(
      (part): part is Extract<(typeof parts)[number], { type: 'text' }> =>
        part.type === 'text',
    )
    .map((part) => part.content)
    .join('')
}

function CompactionPage() {
  const [selectedModel, setSelectedModel] =
    useState<ModelOption>(DEFAULT_MODEL_OPTION)
  const [maxTokens, setMaxTokens] = useState(400)
  const [strategy, setStrategy] = useState<'evict' | 'summarize'>('evict')
  const [input, setInput] = useState('')
  const selectedProviderRef = useRef(selectedModel.provider)
  selectedProviderRef.current = selectedModel.provider
  const snapshot = useByok(byok)
  const [envKeyStatus, setEnvKeyStatus] = useState<Record<string, boolean>>({})
  const [keyDialog, setKeyDialog] = useState<{
    open: boolean
    provider: ProviderId | null
  }>({ open: false, provider: null })

  useEffect(() => {
    void getEnvKeyStatus().then(setEnvKeyStatus)
  }, [])

  useEffect(() => {
    if (snapshot.prompt?.reason === 'missing') {
      setKeyDialog({ open: true, provider: snapshot.prompt.provider })
    }
  }, [snapshot.prompt])

  const forwardedProps = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
      maxTokens,
      strategy,
    }),
    [selectedModel.provider, selectedModel.model, maxTokens, strategy],
  )

  const { messages, sendMessage, isLoading, error } = useChat({
    connection: fetchServerSentEvents('/api/compaction'),
    byok,
    byokProvider: () => toByokProvider(selectedProviderRef.current),
    forwardedProps,
    devtools: { name: 'Compaction' },
  })

  const submit = () => {
    const text = input.trim()
    if (!text || isLoading) return
    sendMessage(text)
    setInput('')
  }

  return (
    <div className="flex h-[calc(100vh-72px)] flex-col bg-gray-900 text-white">
      <div className="space-y-3 border-b border-cyan-500/20 bg-gray-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Scissors size={16} className="text-cyan-400" />
          <h1 className="text-sm font-semibold">Compaction</h1>
        </div>
        <p className="text-sm text-gray-400">
          Chat until the transcript passes maxTokens. Then open TanStack
          DevTools (bottom-right), pick the AI plugin, and click the compaction
          step to see before and after token counts.
        </p>
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
              setSelectedModel(MODEL_OPTIONS[parseInt(e.target.value)]!)
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
        <ByokKeyDialog
          open={keyDialog.open}
          onOpenChange={(open) => setKeyDialog((s) => ({ ...s, open }))}
          envStatus={envKeyStatus}
          activeProvider={toByokProvider(selectedModel.provider)}
          highlightProvider={keyDialog.provider}
        />
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
        <div>
          <label className="mb-1 block text-sm text-gray-400">Strategy:</label>
          <select
            value={strategy}
            onChange={(e) =>
              setStrategy(
                e.target.value === 'summarize' ? 'summarize' : 'evict',
              )
            }
            disabled={isLoading}
            className="w-full rounded-lg border border-cyan-500/20 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50"
          >
            <option value="evict">Evict oldest (drop + marker)</option>
            <option value="summarize">
              Summarize oldest (extra model call)
            </option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-gray-500">
            Send a few long messages. Once the running transcript passes{' '}
            {maxTokens} estimated tokens, older messages are compacted for the
            model only. The chat still shows the full transcript.
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

      {error && (
        <div className="mx-4 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error.message}
        </div>
      )}

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
  )
}

export const Route = createFileRoute('/compaction')({
  component: CompactionPage,
})
