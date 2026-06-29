import { useEffect, useRef, useState } from 'react'
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

const PROMPT_SUGGESTIONS = [
  'Build a self-contained TanStack Start app — a polished kanban board with drag-and-drop and localStorage (no APIs or env). Call the tanstackStartRecipe tool first, scaffold it, install deps, start the dev server, and give me the preview URL.',
  'Build a TanStack Start dashboard with a sortable/filterable table over bundled sample data — no keys needed — and give me the preview URL.',
  'Add a dark-mode toggle and a second route with a detail view.',
]

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
  } catch {}
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

function previewUrlFrom(output: unknown): string | null {
  let value = output
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return /^https?:\/\//.test(output as string) ? (output as string) : null
    }
  }
  if (value && typeof value === 'object' && 'url' in value) {
    const url = (value as { url: unknown }).url
    return typeof url === 'string' ? url : null
  }
  return null
}

function PreviewLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-linear-to-r from-emerald-500 to-teal-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition-transform hover:scale-[1.02]"
    >
      <ExternalLink className="h-4 w-4" />
      Open preview
      <span className="font-mono text-xs text-emerald-100/80">
        {url.replace(/^https?:\/\//, '')}
      </span>
    </a>
  )
}

function SandboxBooting() {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-900/10 px-4 py-3 text-sm text-gray-400">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
      <span>
        <span className="font-medium text-indigo-200">Starting sandbox…</span>{' '}
        booting the Cloudflare container and Grok Build harness.
      </span>
    </div>
  )
}

function Messages({
  messages,
  booting,
  onPreviewUrl,
}: {
  messages: Array<UIMessage>
  booting: boolean
  onPreviewUrl: (url: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, booting])

  if (!messages.length) {
    return (
      <div className="text-sm text-gray-400">
        Ask the agent to build a self-contained app. It will scaffold, run, and
        hand back a preview URL.
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
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

        const isUser = message.role === 'user'

        return (
          <div
            key={message.id}
            className={`mb-4 ${isUser ? 'text-right' : 'text-left'}`}
          >
            {isUser ? (
              <div className="inline-block max-w-[85%] rounded-2xl bg-indigo-600 px-4 py-2 text-sm text-white">
                {message.parts
                  .filter((p) => p.type === 'text')
                  .map((p) => (p.type === 'text' ? p.content : ''))
                  .join('')}
              </div>
            ) : (
              <div className="max-w-[95%]">
                {message.parts.map((part, index) => {
                  if (part.type === 'thinking' && part.content.trim()) {
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
                      <div
                        key={`text-${index}`}
                        className="inline-block max-w-full rounded-2xl bg-gray-800 px-4 py-2 text-sm text-gray-200"
                      >
                        <div className="markdown-content">
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
                      </div>
                    )
                  }

                  if (part.type === 'tool-call') {
                    const resultContent = results.get(part.id)
                    const output = part.output ?? resultContent
                    if (
                      part.name === 'exposePreview' ||
                      part.name === 'expose_preview'
                    ) {
                      const url = previewUrlFrom(output)
                      if (url) {
                        onPreviewUrl(url)
                        return <PreviewLink key={part.id} url={url} />
                      }
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
            )}
          </div>
        )
      })}
      {booting && <SandboxBooting />}
    </div>
  )
}

function SandboxAgentPage() {
  const [threadId] = useState(() => crypto.randomUUID())
  const [input, setInput] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: fetchServerSentEvents('/api/run'),
    body: { threadId },
  })

  const booting =
    isLoading &&
    messages.length > 0 &&
    messages[messages.length - 1].role === 'user'

  const handleSend = (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || isLoading) return
    sendMessage(content)
    setInput('')
    setPreviewUrl(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col">
      <header className="border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <Server className="h-5 w-5 text-indigo-400" />
        <div className="font-semibold">
          TanStack AI — Grok Build (Cloudflare Sandbox)
        </div>
        <span className="text-xs text-gray-500 font-mono">
          thread {threadId.slice(0, 8)}
        </span>
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300"
          >
            Open preview <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </header>

      <div className="flex-1 overflow-hidden p-4">
        <div className="h-full rounded-xl border border-white/10 bg-gray-950/60 p-4">
          <Messages
            messages={messages}
            booting={booting}
            onPreviewUrl={setPreviewUrl}
          />
        </div>
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {PROMPT_SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSend(s)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10 text-left"
              disabled={isLoading}
            >
              {s.length > 80 ? s.slice(0, 77) + '…' : s}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell the agent what to build…"
            className="min-h-[44px] flex-1 resize-y rounded-xl border border-white/10 bg-gray-950 px-3 py-2 text-sm outline-none focus:border-indigo-500/50"
            disabled={isLoading}
          />
          {isLoading ? (
            <button
              onClick={stop}
              className="rounded-xl bg-rose-600 px-3 py-2 text-sm"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="rounded-xl bg-indigo-600 px-3 py-2 text-sm disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-1 text-[10px] text-gray-500">
          Runs inside a Cloudflare sandbox container using Grok Build harness.
        </div>
      </div>
    </div>
  )
}
