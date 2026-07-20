import { useEffect, useMemo, useState } from 'react'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import {
  Chat,
  ChatInput,
  ChatMessage,
  ChatMessages,
} from '@tanstack/ai-react-ui'

type Backend = 'go' | 'rust' | 'php' | 'zig'
type Provider = 'openai' | 'anthropic'

type ServerSetup = {
  summary: string
  installUrl: string
  verify: string
  run: string
}

type ServerInfo = {
  id: Backend
  label: string
  port: number
  available: boolean
  disabledByEnv: boolean
  setup: ServerSetup
}

type ServersManifest = {
  generatedAt: string
  servers: ServerInfo[]
}

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

function SetupInstructions({ server }: { server: ServerInfo }) {
  return (
    <div className="flex min-h-[70vh] flex-1 flex-col rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400">
            Setup required
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">
            {server.label} server unavailable
          </h2>
          <p className="mt-2 text-sm text-slate-400">{server.setup.summary}</p>
          {server.disabledByEnv ? (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              This backend is disabled on this machine via{' '}
              <code className="rounded bg-slate-950 px-1 py-0.5 text-amber-200">
                AGUI_DISABLE_SERVERS
              </code>
              . Remove <code className="rounded bg-slate-950 px-1 py-0.5 text-amber-200">{server.id}</code>{' '}
              from that variable and restart <code className="rounded bg-slate-950 px-1 py-0.5 text-amber-200">pnpm dev:all</code>.
            </p>
          ) : null}
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <p className="text-slate-400">Install</p>
            <a
              href={server.setup.installUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex text-amber-300 underline-offset-4 hover:underline"
            >
              {server.setup.installUrl}
            </a>
          </div>

          <div>
            <p className="text-slate-400">Verify</p>
            <code className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100">
              {server.setup.verify}
            </code>
          </div>

          <div>
            <p className="text-slate-400">Run this backend</p>
            <code className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100">
              {server.setup.run}
            </code>
          </div>

          <div>
            <p className="text-slate-400">Refresh availability</p>
            <code className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100">
              node scripts/detect-servers.mjs
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}

export function App() {
  const [servers, setServers] = useState<ServerInfo[]>([])
  const [serversLoading, setServersLoading] = useState(true)
  const [backend, setBackend] = useState<Backend>('go')
  const [provider, setProvider] = useState<Provider>('openai')
  const [model, setModel] = useState(PROVIDERS[0].defaultModel)

  useEffect(() => {
    let cancelled = false

    async function loadServers() {
      try {
        const response = await fetch('/servers.json')
        if (!response.ok) {
          throw new Error(`Failed to load servers.json (${response.status})`)
        }
        const manifest = (await response.json()) as ServersManifest
        if (cancelled) return
        setServers(manifest.servers)
        if (manifest.servers.length > 0) {
          setBackend((current) =>
            manifest.servers.some((server) => server.id === current)
              ? current
              : manifest.servers[0].id,
          )
        }
      } catch (error) {
        console.error('[ag-ui] failed to load servers.json', error)
      } finally {
        if (!cancelled) {
          setServersLoading(false)
        }
      }
    }

    void loadServers()

    return () => {
      cancelled = true
    }
  }, [])

  const active =
    servers.find((item) => item.id === backend) ??
    servers[0] ??
    ({
      id: 'go',
      label: 'Go',
      port: 8001,
      available: false,
      disabledByEnv: false,
      setup: {
        summary: 'Install Go 1.22+ and ensure `go` is on PATH.',
        installUrl: 'https://go.dev/dl/',
        verify: 'go version',
        run: 'pnpm dev:go',
      },
    } satisfies ServerInfo)

  const activeProvider =
    PROVIDERS.find((item) => item.id === provider) ?? PROVIDERS[0]

  const connection = useMemo(
    () =>
      active.available
        ? fetchServerSentEvents(`/api/${backend}`, () => ({
            body: { provider, model },
          }))
        : null,
    [active.available, backend, provider, model],
  )

  const handleProviderChange = (nextProvider: Provider) => {
    setProvider(nextProvider)
    const next = PROVIDERS.find((item) => item.id === nextProvider)
    if (next) {
      setModel(next.defaultModel)
    }
  }

  const subtitle = active.available
    ? `${active.label} server on :${active.port} → ${activeProvider.label}`
    : `${active.label} not available — setup required`

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
              <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
            </div>

            <div
              className="inline-flex flex-wrap rounded-lg border border-slate-700 bg-slate-900 p-1"
              role="tablist"
              aria-label="Backend server"
            >
              {(serversLoading ? [] : servers).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={backend === item.id}
                  onClick={() => setBackend(item.id)}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    backend === item.id
                      ? 'bg-amber-500 text-slate-950'
                      : item.available
                        ? 'text-slate-300 hover:text-white'
                        : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {item.label}
                  {!item.available ? ' · setup' : ''}
                </button>
              ))}
            </div>
          </div>

          {active.available ? (
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
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6">
        {serversLoading ? (
          <div className="flex min-h-[70vh] flex-1 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50 text-sm text-slate-400">
            Loading backend availability…
          </div>
        ) : active.available && connection ? (
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
        ) : (
          <SetupInstructions server={active} />
        )}
      </main>
    </div>
  )
}
