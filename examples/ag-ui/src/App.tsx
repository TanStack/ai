import { useMemo, useState } from 'react'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import {
  Chat,
  ChatInput,
  ChatMessage,
  ChatMessages,
} from '@tanstack/ai-react-ui'

type Backend = 'go' | 'rust'
type Provider = 'openai' | 'anthropic'

const BACKENDS: Array<{ id: Backend; label: string; port: number }> = [
  { id: 'go', label: 'Go', port: 8001 },
  { id: 'rust', label: 'Rust', port: 8002 },
]

const PROVIDERS: Array<{
  id: Provider
  label: string
  defaultModel: string
}> = [
  { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o' },
  {
    id: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-sonnet-4-6',
  },
]

export function App() {
  const [backend, setBackend] = useState<Backend>('go')
  const [provider, setProvider] = useState<Provider>('openai')
  const [model, setModel] = useState(PROVIDERS[0].defaultModel)

  const active = BACKENDS.find((item) => item.id === backend) ?? BACKENDS[0]
  const activeProvider =
    PROVIDERS.find((item) => item.id === provider) ?? PROVIDERS[0]

  const connection = useMemo(
    () =>
      fetchServerSentEvents(`/api/${backend}`, () => ({
        body: { provider, model },
      })),
    [backend, provider, model],
  )

  const handleProviderChange = (nextProvider: Provider) => {
    setProvider(nextProvider)
    const next = PROVIDERS.find((item) => item.id === nextProvider)
    if (next) {
      setModel(next.defaultModel)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400">
                TanStack AI
              </p>
              <h1 className="text-xl font-semibold text-white">
                AG-UI Polyglot Chat
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                {active.label} server on :{active.port} → {activeProvider.label}
              </p>
            </div>

            <div
              className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1"
              role="tablist"
              aria-label="Backend server"
            >
              {BACKENDS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={backend === item.id}
                  onClick={() => setBackend(item.id)}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    backend === item.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="text-slate-400">Provider</span>
              <select
                value={provider}
                onChange={(event) =>
                  handleProviderChange(event.target.value as Provider)
                }
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              >
                {PROVIDERS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-[2] flex-col gap-1 text-sm">
              <span className="text-slate-400">Model</span>
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                placeholder={activeProvider.defaultModel}
              />
            </label>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6">
        <Chat
          key={`${backend}-${provider}-${model}`}
          className="flex min-h-[70vh] flex-1 flex-col rounded-xl border border-slate-800 bg-slate-900/50"
          connection={connection}
        >
          <ChatMessages
            className="flex-1 space-y-4 overflow-y-auto p-4"
            emptyState={
              <div className="flex h-full min-h-48 items-center justify-center text-center text-sm text-slate-400">
                Chat with {active.label} over AG-UI SSE using{' '}
                {activeProvider.label}.
              </div>
            }
          >
            {(message: UIMessage) => <ChatMessage message={message} />}
          </ChatMessages>
          <div className="border-t border-slate-800 p-4">
            <ChatInput
              placeholder={`Message via ${active.label} + ${activeProvider.label}…`}
            />
          </div>
        </Chat>
      </main>
    </div>
  )
}
