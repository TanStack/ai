import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Check, Loader2, Send, Square } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { MCPAppResource } from '@tanstack/ai-react/mcp-apps'
import type { UIMessage } from '@tanstack/ai-react'
import { MCP_PROVIDERS, type McpProvider } from '@/lib/mcp-providers'
import { SANDBOX_PROXY_URL } from '@/lib/mcp-apps'

type Part = UIMessage['parts'][number]

// Reuse the MCP Apps sandbox proxy — Tier F artifacts render through the exact
// same iframe path.
const SANDBOX = { url: new URL(SANDBOX_PROXY_URL) }

// Tier F authoring prompts: one static (html-fragment), one interactive
// (react-tsx with local state).
const SUGGESTIONS = [
  {
    label: '💳 Pricing card (HTML)',
    prompt:
      'Render a styled pricing card for a "Pro" plan at $29/month with 4 feature bullets and a Subscribe button, as an html-fragment artifact.',
  },
  {
    label: '🧮 Tip calculator (React)',
    prompt:
      'Render an interactive tip calculator as a react-tsx artifact: a bill amount input, a tip percentage slider (0–30%), and live totals (tip + grand total).',
  },
  {
    label: '✅ Todo list (React)',
    prompt:
      'Render a react-tsx artifact: a small todo list where I can type a task, press Enter to add it, and check items off. Keep all state local.',
  },
]

function Messages({ messages }: { messages: Array<UIMessage> }) {
  const visible = messages.filter((m) =>
    m.parts.some(
      (p) =>
        (p.type === 'text' && p.content.trim()) ||
        p.type === 'ui-resource' ||
        p.type === 'tool-call',
    ),
  )

  if (!visible.length) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-2xl text-center text-sm text-gray-400">
          Ask for a UI and the model authors a Tier F artifact — a sandboxed
          iframe rendered inline. Pick a suggestion below to start.
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {visible.map((message) => (
        <div
          key={message.id}
          className={`mb-2 rounded-lg p-4 ${
            message.role === 'assistant'
              ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
              : 'bg-transparent'
          }`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-medium text-white ${
                message.role === 'assistant'
                  ? 'bg-linear-to-r from-orange-500 to-red-600'
                  : 'bg-gray-700'
              }`}
            >
              {message.role === 'assistant' ? 'AI' : 'U'}
            </div>
            <div className="min-w-0 flex-1">
              {message.parts.map((part: Part, index) => {
                if (part.type === 'text' && part.content) {
                  return (
                    <div
                      key={`text-${index}`}
                      className="prose dark:prose-invert max-w-none text-white"
                    >
                      <ReactMarkdown
                        rehypePlugins={[
                          rehypeRaw,
                          rehypeSanitize,
                          rehypeHighlight,
                        ]}
                        remarkPlugins={[remarkGfm]}
                      >
                        {part.content}
                      </ReactMarkdown>
                    </div>
                  )
                }

                // A Tier F artifact — display-only, so no bridge is passed. Any
                // interactivity lives inside the sandboxed iframe (local React
                // state); there is no host round-trip in this demo.
                if (part.type === 'ui-resource') {
                  return (
                    <div
                      key={`ui-${index}`}
                      className="my-2 overflow-hidden rounded-lg border border-orange-500/20 bg-gray-900/40"
                    >
                      <MCPAppResource part={part} sandbox={SANDBOX} />
                    </div>
                  )
                }

                if (part.type === 'tool-call') {
                  const done =
                    part.state === 'complete' || part.output !== undefined
                  return (
                    <div
                      key={`tool-${index}`}
                      className="my-1 flex items-center gap-2 text-xs text-gray-400"
                    >
                      {done ? (
                        <Check className="h-3 w-3 text-green-400" />
                      ) : (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      <span className="font-mono">{part.name}</span>
                    </div>
                  )
                }

                return null
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function OpenUiPage() {
  const [provider, setProvider] = useState<McpProvider>('openai')
  const threadId = `openui-${provider}`

  const { messages, sendMessage, isLoading, error, stop } = useChat({
    threadId,
    connection: fetchServerSentEvents('/api/openui-chat'),
    body: { provider },
  })

  const [input, setInput] = useState('')
  const send = (text: string) => {
    if (!text.trim() || isLoading) return
    sendMessage(text.trim())
    setInput('')
  }

  return (
    <div className="flex h-[calc(100vh-72px)] flex-col bg-gray-900">
      <div className="shrink-0 border-b border-orange-500/20 bg-gray-800 px-4 py-3">
        <p className="mb-3 text-xs text-gray-400">
          <strong className="text-gray-200">
            Open Generative UI · Tier F.
          </strong>{' '}
          The model authors a bespoke UI (HTML or React) with the{' '}
          <code>create_artifact</code> tool; it renders in a sandboxed iframe
          through the same MCP Apps path. Set your provider's API key in the
          environment.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-gray-500">
            Provider
          </span>
          {MCP_PROVIDERS.map((p) => (
            <label
              key={p.value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                provider === p.value
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                  : 'border-gray-600 bg-gray-700/50 text-gray-300 hover:border-cyan-500/50'
              }`}
            >
              <input
                type="radio"
                name="openui-provider"
                value={p.value}
                checked={provider === p.value}
                onChange={() => setProvider(p.value)}
                className="sr-only"
              />
              <span className="font-medium">{p.label}</span>
            </label>
          ))}
        </div>
      </div>

      <Messages messages={messages} />

      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error.message}
        </div>
      )}

      <div className="border-t border-orange-500/10 bg-gray-900/80 backdrop-blur-sm">
        <div className="w-full space-y-2 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                onClick={() => send(s.prompt)}
                disabled={isLoading}
                className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs text-orange-200 transition-colors hover:bg-orange-500/20 disabled:opacity-50"
              >
                {s.label}
              </button>
            ))}
          </div>

          {isLoading && (
            <div className="flex items-center justify-center">
              <button
                onClick={stop}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                <Square className="h-4 w-4 fill-current" />
                Stop
              </button>
            </div>
          )}

          <div className="relative flex items-end gap-2">
            <div className="relative flex-1">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask the model to render a UI..."
                className="w-full resize-none overflow-hidden rounded-lg border border-orange-500/20 bg-gray-800/50 py-3 pl-4 pr-12 text-sm text-white placeholder-gray-400 shadow-lg focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                rows={1}
                style={{ minHeight: '44px', maxHeight: '200px' }}
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                    e.preventDefault()
                    send(input)
                  }
                }}
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-orange-500 transition-colors hover:text-orange-400 focus:outline-none disabled:text-gray-500"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/openui')({
  component: OpenUiPage,
})
