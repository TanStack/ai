import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Send,
  Server,
  Square,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'

export const Route = createFileRoute('/')({
  component: SandboxAgentPage,
})

// The coding agents the container image ships. The value is forwarded to the
// server as `metadata.harness`; `resolveHarness` in src/agent.ts validates it.
const HARNESS_OPTIONS = [
  { value: 'grok', label: 'Grok Build' },
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
] as const

type HarnessName = (typeof HARNESS_OPTIONS)[number]['value']

const GROK_MODEL_OPTIONS = [
  { value: 'composer-2.5', label: 'Composer 2.5' },
  { value: 'grok-build-0.1', label: 'grok-build-0.1' },
] as const

type GrokBuildModel = (typeof GROK_MODEL_OPTIONS)[number]['value']

const GROK_PROTOCOL_OPTIONS = [
  { value: 'acp', label: 'ACP (default)' },
  { value: 'streaming-json', label: 'streaming-json' },
] as const

type GrokBuildProtocol = (typeof GROK_PROTOCOL_OPTIONS)[number]['value']

const GROK_TRANSPORT_OPTIONS = [
  { value: 'auto', label: 'auto' },
  { value: 'stdio', label: 'stdio' },
  { value: 'websocket', label: 'websocket' },
] as const

type GrokTransport = (typeof GROK_TRANSPORT_OPTIONS)[number]['value']

function isHarnessName(value: string): value is HarnessName {
  return HARNESS_OPTIONS.some((o) => o.value === value)
}

function isGrokModel(value: string): value is GrokBuildModel {
  return GROK_MODEL_OPTIONS.some((o) => o.value === value)
}

function isGrokProtocol(value: string): value is GrokBuildProtocol {
  return GROK_PROTOCOL_OPTIONS.some((o) => o.value === value)
}

function isGrokTransport(value: string): value is GrokTransport {
  return GROK_TRANSPORT_OPTIONS.some((o) => o.value === value)
}

const PROMPT_SUGGESTIONS = [
  'Build a self-contained TanStack Start app — a polished kanban board with drag-and-drop and localStorage (no APIs or env). Call the tanstackStartRecipe tool first, scaffold it, install deps, start the dev server, and give me the preview URL.',
  'Build a TanStack Start dashboard with a sortable/filterable table over bundled sample data — no keys needed — and give me the preview URL.',
  'Add a dark-mode toggle and a second route with a detail view.',
]

/** One tool-call invocation from the in-sandbox coding agent (bash, edit, …). */
function ToolCall({
  name,
  args,
  output,
}: {
  name: string
  args: string
  output?: unknown
}) {
  let parsedArgs: unknown = args
  try {
    parsedArgs = JSON.parse(args)
  } catch {
    // leave as the raw string
  }
  const running = output === undefined
  return (
    <div className="mt-3 rounded-lg border border-indigo-500/30 bg-indigo-900/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-900/20 text-indigo-300 text-sm">
        {running ? (
          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className="w-4 h-4 rounded-full bg-indigo-500/50" />
        )}
        <span className="font-mono font-medium">{name}</span>
      </div>
      <pre className="px-3 py-2 text-xs text-gray-300 overflow-x-auto max-h-40 overflow-y-auto">
        {typeof parsedArgs === 'string'
          ? parsedArgs
          : JSON.stringify(parsedArgs, null, 2)}
      </pre>
      {output !== undefined && (
        <pre className="px-3 pb-3 text-xs text-gray-400 border-t border-indigo-500/20 overflow-x-auto max-h-40 overflow-y-auto">
          {typeof output === 'string'
            ? output
            : JSON.stringify(output, null, 2)}
        </pre>
      )}
    </div>
  )
}

/** Pull the preview URL out of an `exposePreview` tool result (object or JSON string). */
function previewUrlFrom(output: unknown): string | null {
  let value: unknown = output
  if (typeof output === 'string') {
    try {
      value = JSON.parse(output)
    } catch {
      return /^https?:\/\//.test(output) ? output : null
    }
  }
  if (value !== null && typeof value === 'object' && 'url' in value) {
    const url = value.url
    return typeof url === 'string' ? url : null
  }
  return null
}

/**
 * The agent's planning / "thinking" stream, collapsed by default. Codex and Grok
 * emit a lot of it before they act; Claude Code emits some too. Auto-opens while
 * it's the live tail and collapses once real output (text / a tool call) follows.
 */
function PlanningPanel({
  content,
  streaming,
}: {
  content: string
  streaming: boolean
}) {
  const [open, setOpen] = useState(streaming)
  useEffect(() => {
    if (!streaming) setOpen(false)
  }, [streaming])

  return (
    <div className="mb-2 rounded-lg border border-gray-700/60 bg-gray-800/40 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-300 hover:bg-white/5"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <span className="font-medium">
          {streaming ? 'Planning…' : 'Planning'}
        </span>
        {streaming && (
          <div className="ml-auto h-3 w-3 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
        )}
      </button>
      {open && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-white/10 px-3 py-2 text-gray-400">
          {content}
        </pre>
      )}
    </div>
  )
}

/** The headline result of the demo: a clickable link to the app the agent built. */
function PreviewLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-linear-to-r from-emerald-500 to-teal-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition-transform hover:scale-[1.02]"
    >
      <ExternalLink className="w-4 h-4" />
      Open preview
      <span className="font-mono text-xs text-emerald-100/80">
        {url.replace(/^https?:\/\//, '')}
      </span>
    </a>
  )
}

/**
 * Shown while a request is in flight but no stream chunk has arrived yet — that
 * window is the sandbox booting: `withSandbox` is creating (or resuming) the
 * sandbox and preparing the coding agent before the agent loop streams. It's the
 * slow part of the first message, so make the wait legible.
 */
function SandboxBooting() {
  return (
    <div className="p-4">
      <div className="flex items-start gap-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-linear-to-r from-indigo-500 to-violet-600 shrink-0">
          <Server className="w-4 h-4 text-white" />
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-indigo-500/30 bg-indigo-900/10 px-4 py-3">
          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">
            <span className="font-medium text-indigo-200">
              Starting sandbox…
            </span>{' '}
            <span className="text-gray-400">
              starting the Cloudflare container and installing the coding agent.
              The first message takes a moment.
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}

function Messages({
  messages,
  booting,
}: {
  messages: Array<UIMessage>
  booting: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages, booting])

  if (!messages.length) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 text-center text-gray-500">
        <p className="max-w-md">
          Ask the sandbox agent to build a self-contained TanStack Start app —
          it scaffolds it, runs it in the container, and hands back a live
          preview URL. No API keys needed.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-4"
      style={{ scrollbarWidth: 'thin' }}
    >
      {messages.map((message) => {
        const results = new Map<string, string>()
        for (const part of message.parts) {
          if (part.type === 'tool-result') {
            results.set(
              part.toolCallId,
              typeof part.content === 'string'
                ? part.content
                : JSON.stringify(part.content),
            )
          }
        }
        return (
          <div
            key={message.id}
            className={`p-4 rounded-lg mb-2 ${
              message.role === 'assistant'
                ? 'bg-linear-to-r from-indigo-500/5 to-violet-600/5'
                : 'bg-transparent'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium text-white shrink-0 ${
                  message.role === 'assistant'
                    ? 'bg-linear-to-r from-indigo-500 to-violet-600'
                    : 'bg-gray-700'
                }`}
              >
                {message.role === 'assistant' ? 'AI' : 'U'}
              </div>
              <div className="flex-1 min-w-0">
                {message.parts.map((part, index) => {
                  if (part.type === 'thinking' && part.content.trim()) {
                    // Streaming while no later part is real output yet.
                    const streaming = !message.parts
                      .slice(index + 1)
                      .some((p) => p.type === 'text' || p.type === 'tool-call')
                    return (
                      <PlanningPanel
                        key={`thinking-${index}`}
                        content={part.content}
                        streaming={streaming}
                      />
                    )
                  }
                  if (part.type === 'text' && part.content) {
                    return (
                      <div key={`text-${index}`} className="markdown-content">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[
                            rehypeRaw,
                            rehypeSanitize,
                            rehypeHighlight,
                          ]}
                        >
                          {part.content}
                        </ReactMarkdown>
                      </div>
                    )
                  }
                  if (part.type === 'tool-call') {
                    const resultContent = results.get(part.id)
                    const output = part.output ?? resultContent
                    // The preview-URL result gets its own clickable card.
                    if (part.name === 'exposePreview') {
                      const url = previewUrlFrom(output)
                      if (url) return <PreviewLink key={part.id} url={url} />
                    }
                    return (
                      <ToolCall
                        key={part.id}
                        name={part.name}
                        args={part.arguments}
                        output={output}
                      />
                    )
                  }
                  return null
                })}
              </div>
            </div>
          </div>
        )
      })}
      {booting && <SandboxBooting />}
    </div>
  )
}

function SandboxAgentPage() {
  // One sandbox per thread, so every follow-up message lands in the same
  // workspace. Switching the harness starts a FRESH thread: the container's
  // injected secret env + the running agent are per-harness, so a new harness
  // needs a new sandbox (and a clean conversation).
  const [threadId, setThreadId] = useState(() => crypto.randomUUID())
  const [harness, setHarness] = useState<HarnessName>('grok')
  const [grokModel, setGrokModel] = useState<GrokBuildModel>('composer-2.5')
  const [grokProtocol, setGrokProtocol] = useState<GrokBuildProtocol>('acp')
  const [grokTransport, setGrokTransport] = useState<GrokTransport>('auto')
  const [input, setInput] = useState('')

  // Memoized so a body identity change only happens on a real thread/harness
  // switch, not on every keystroke-driven render.
  const body = useMemo(
    () => ({
      threadId,
      harness,
      ...(harness === 'grok'
        ? { grokModel, grokProtocol, grokTransport }
        : {}),
    }),
    [threadId, harness, grokModel, grokProtocol, grokTransport],
  )

  const { messages, sendMessage, isLoading, stop, clear } = useChat({
    connection: fetchServerSentEvents('/api/run'),
    body,
  })

  function changeHarness(next: HarnessName) {
    if (next === harness || isLoading) return
    clear()
    setHarness(next)
    setThreadId(crypto.randomUUID())
  }

  // A request is in flight but nothing has streamed back yet (the last message is
  // still the user's) → the sandbox is booting. Once the first chunk arrives an
  // assistant message is appended and this clears.
  const booting =
    isLoading &&
    messages.length > 0 &&
    messages[messages.length - 1].role === 'user'

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <header className="flex items-center justify-between border-b border-indigo-500/10 bg-gray-900/80 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-white">
          <Server className="w-5 h-5 text-indigo-400" />
          <span className="font-semibold">Cloudflare Sandbox Agent</span>
          <span className="text-xs text-gray-500">
            Worker → Durable Object → Container
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-indigo-300">
          <label
            className="flex items-center gap-2"
            title="Switching starts a fresh sandbox + conversation."
          >
            <span className="text-xs text-gray-500">harness</span>
            <select
              value={harness}
              onChange={(e) => {
                if (isHarnessName(e.target.value)) changeHarness(e.target.value)
              }}
              disabled={isLoading}
              className="rounded-md border border-indigo-500/20 bg-gray-800 px-2 py-1 text-sm text-white disabled:opacity-50"
            >
              {HARNESS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {harness === 'grok' && (
            <>
              <label className="flex items-center gap-2" title="Grok Build model">
                <span className="text-xs text-gray-500">model</span>
                <select
                  value={grokModel}
                  onChange={(e) => {
                    if (isGrokModel(e.target.value)) {
                      setGrokModel(e.target.value)
                    }
                  }}
                  disabled={isLoading}
                  className="rounded-md border border-indigo-500/20 bg-gray-800 px-2 py-1 text-sm text-white disabled:opacity-50"
                >
                  {GROK_MODEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2" title="Grok Build wire protocol">
                <span className="text-xs text-gray-500">protocol</span>
                <select
                  value={grokProtocol}
                  onChange={(e) => {
                    if (isGrokProtocol(e.target.value)) {
                      setGrokProtocol(e.target.value)
                    }
                  }}
                  disabled={isLoading}
                  className="rounded-md border border-indigo-500/20 bg-gray-800 px-2 py-1 text-sm text-white disabled:opacity-50"
                >
                  {GROK_PROTOCOL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {grokProtocol === 'acp' && (
                <label
                  className="flex items-center gap-2"
                  title="ACP transport (auto picks stdio vs WebSocket)"
                >
                  <span className="text-xs text-gray-500">transport</span>
                  <select
                    value={grokTransport}
                    onChange={(e) => {
                      if (isGrokTransport(e.target.value)) {
                        setGrokTransport(e.target.value)
                      }
                    }}
                    disabled={isLoading}
                    className="rounded-md border border-indigo-500/20 bg-gray-800 px-2 py-1 text-sm text-white disabled:opacity-50"
                  >
                    {GROK_TRANSPORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          <span className="font-mono">thread {threadId.slice(0, 8)}</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full overflow-hidden">
          <Messages messages={messages} booting={booting} />
        </div>

        <div className="border-t border-indigo-500/10 bg-gray-900/80 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto px-4 py-3 space-y-3">
            {isLoading && (
              <div className="flex items-center justify-center">
                <button
                  onClick={stop}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Square className="w-4 h-4 fill-current" />
                  Stop
                </button>
              </div>
            )}
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask the sandbox agent to write or run code…"
                className="w-full rounded-lg border border-indigo-500/20 bg-gray-800/50 pl-4 pr-12 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none overflow-hidden shadow-lg"
                rows={1}
                style={{ minHeight: '44px', maxHeight: '200px' }}
                disabled={isLoading}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height =
                    Math.min(target.scrollHeight, 200) + 'px'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                    e.preventDefault()
                    sendMessage(input)
                    setInput('')
                  }
                }}
              />
              <button
                onClick={() => {
                  if (input.trim()) {
                    sendMessage(input)
                    setInput('')
                  }
                }}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-indigo-400 hover:text-indigo-300 disabled:text-gray-500 transition-colors focus:outline-none"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {PROMPT_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    if (!isLoading) sendMessage(suggestion)
                  }}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-indigo-500/20 hover:border-indigo-500/40 text-gray-300 hover:text-white rounded-full transition-all disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
