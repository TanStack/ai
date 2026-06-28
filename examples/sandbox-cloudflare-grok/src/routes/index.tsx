import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ExternalLink, Send, Server, Square } from 'lucide-react'
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
        {typeof parsedArgs === 'string' ? parsedArgs : JSON.stringify(parsedArgs, null, 2)}
      </pre>
      {output !== undefined && (
        <pre className="px-3 pb-3 text-xs text-gray-400 border-t border-indigo-500/20 overflow-x-auto max-h-40 overflow-y-auto">
          {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
        </pre>
      )}
    </div>
  )
}

function previewUrlFrom(output: unknown): string | null {
  let value = output
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return /^https?:\/\//.test(output as string) ? (output as string) : null }
  }
  if (value && typeof value === 'object' && 'url' in value) {
    const url = (value as { url: unknown }).url
    return typeof url === 'string' ? url : null
  }
  return null
}

function SandboxAgentPage() {
  const [input, setInput] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status, stop } = useChat({
    connection: fetchServerSentEvents('/api/run'),
    onToolCall: (_toolCallId, toolName, _args, result) => {
      if (toolName === 'exposePreview' || toolName === 'expose_preview') {
        const url = previewUrlFrom(result)
        if (url) setPreviewUrl(url)
      }
    },
  })

  const isStreaming = status === 'streaming'

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const handleSend = (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || isStreaming) return
    sendMessage({ role: 'user', content })
    setInput('')
    setPreviewUrl(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const renderMessage = (m: UIMessage, idx: number) => {
    const isUser = m.role === 'user'
    const text = (m.parts ?? [])
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.content ?? p.text ?? '')
      .join('')
    const toolParts = (m.parts ?? []).filter((p: any) => p.type === 'tool-call' || p.type === 'tool')

    return (
      <div key={idx} className={`mb-4 ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block max-w-[85%] rounded-2xl px-4 py-2 text-sm ${isUser ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-200'}`}>
          {text && <div className="markdown-content"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight]}>{text}</ReactMarkdown></div>}
        </div>
        {toolParts.length > 0 && (
          <div className="mt-1 space-y-1 text-left">
            {toolParts.map((tp: any, i: number) => (
              <ToolCall key={i} name={tp.toolName ?? tp.name ?? 'tool'} args={JSON.stringify(tp.args ?? tp.input ?? {})} output={tp.result ?? tp.output} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col">
      <header className="border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <Server className="h-5 w-5 text-indigo-400" />
        <div className="font-semibold">TanStack AI — Grok Build (Cloudflare Sandbox)</div>
        {previewUrl && (
          <a href={previewUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300">
            Open preview <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </header>

      <div className="flex-1 overflow-hidden p-4">
        <div ref={scrollRef} className="h-full overflow-auto rounded-xl border border-white/10 bg-gray-950/60 p-4">
          {messages.length === 0 && (
            <div className="text-sm text-gray-400">Ask the agent to build a self-contained app. It will scaffold, run, and hand back a preview URL.</div>
          )}
          {messages.map(renderMessage)}
          {isStreaming && (
            <div className="text-xs text-gray-500 flex items-center gap-2"><div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> Grok Build is working…</div>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {PROMPT_SUGGESTIONS.map((s, i) => (
            <button key={i} onClick={() => handleSend(s)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10 text-left" disabled={isStreaming}>{s.length > 80 ? s.slice(0, 77) + '…' : s}</button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell the agent what to build…"
            className="min-h-[44px] flex-1 resize-y rounded-xl border border-white/10 bg-gray-950 px-3 py-2 text-sm outline-none focus:border-indigo-500/50"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button onClick={stop} className="rounded-xl bg-rose-600 px-3 py-2 text-sm"><Square className="h-4 w-4" /></button>
          ) : (
            <button onClick={() => handleSend()} disabled={!input.trim()} className="rounded-xl bg-indigo-600 px-3 py-2 text-sm disabled:opacity-50"><Send className="h-4 w-4" /></button>
          )}
        </div>
        <div className="mt-1 text-[10px] text-gray-500">Runs inside a Cloudflare sandbox container using Grok Build harness.</div>
      </div>
    </div>
  )
}
