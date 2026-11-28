import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Send, Square } from 'lucide-react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import { runSandboxDemo } from '@/lib/sandbox-demo'
import type { SandboxRunResult } from '@tanstack/ai-mcp-sandbox'

const SCENARIOS = [
  { id: 'ok', label: 'Run (allowed)' },
  { id: 'loop', label: 'Infinite loop' },
  { id: 'fetch', label: 'Reach 169.254.169.254' },
  { id: 'budget', label: 'Exceed call budget' },
] as const

/**
 * Surface B demo: a TanStack Start server function whose body runs in a QuickJS
 * isolate with only `host.db.metrics`. The first button does real work; the
 * other three each try to go off the rails and get stopped by a guardrail.
 */
function SandboxDemo() {
  const [busy, setBusy] = useState<string | null>(null)
  const [run, setRun] = useState<{
    scenario: string
    result: SandboxRunResult
  } | null>(null)

  const go = async (scenario: (typeof SCENARIOS)[number]['id']) => {
    setBusy(scenario)
    setRun(null)
    try {
      setRun({ scenario, result: await runSandboxDemo({ data: { scenario } }) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="border-b border-orange-500/10 bg-gray-800/40 px-4 py-3">
      <h3 className="text-sm font-semibold text-white">
        Sandboxed endpoint (server function)
      </h3>
      <p className="mb-2 text-xs text-gray-400">
        Each button runs a snippet in a QuickJS isolate with only{' '}
        <code className="text-orange-400">host.db.metrics</code>. Three of them
        try to escape.
      </p>
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(s.id)}
            disabled={busy !== null}
            className="rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-1.5 text-xs text-white hover:border-orange-500/50 disabled:opacity-50"
          >
            {busy === s.id ? 'Running…' : s.label}
          </button>
        ))}
      </div>
      {run ? (
        <div className="mt-3 rounded-lg border border-gray-700 bg-gray-900 p-3 text-xs">
          <div className="mb-1 flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 font-medium ${
                run.result.ok
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {run.result.ok ? 'returned' : 'blocked'}
            </span>
            <span className="text-gray-400">
              {run.result.ms}ms · {run.result.injectedCalls} host call(s)
            </span>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap text-gray-200">
            {run.result.ok
              ? JSON.stringify(run.result.value, null, 2)
              : run.result.error}
          </pre>
        </div>
      ) : null}
    </div>
  )
}

function Messages({ messages }: { messages: ReadonlyArray<UIMessage> }) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const visibleMessages = messages.filter((message) =>
    message.parts.some((part) => part.type === 'text' && part.content.trim()),
  )

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight
    }
  }, [visibleMessages])

  if (!visibleMessages.length) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-2 text-xl font-semibold text-white">
            Welcome to TanStack AI
          </h2>
          <p className="text-sm text-gray-400">
            Ask &quot;Is SKU-123 in stock?&quot; to call the sandboxed tool.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto px-4 py-4"
    >
      {visibleMessages.map((message) => (
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
              {message.parts.map((part, index) => {
                if (part.type === 'text' && part.content) {
                  return (
                    <div
                      key={`text-${index}`}
                      className="whitespace-pre-wrap text-white"
                    >
                      {part.content}
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

function ChatPage() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'secure-sandbox-tools',
  })

  const handleSendMessage = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="flex h-screen bg-gray-900">
      <div className="flex w-full flex-col">
        <SandboxDemo />

        <Messages messages={messages} />

        {error ? (
          <div className="mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error.message}
          </div>
        ) : null}

        <div className="border-t border-orange-500/10 bg-gray-900/80 backdrop-blur-sm">
          <div className="w-full px-4 py-3">
            {isLoading ? (
              <div className="mb-3 flex items-center justify-center">
                <button
                  type="button"
                  onClick={stop}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  <Square className="h-4 w-4 fill-current" />
                  Stop
                </button>
              </div>
            ) : null}
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                className="w-full resize-none overflow-hidden rounded-lg border border-orange-500/20 bg-gray-800/50 py-3 pl-4 pr-12 text-sm text-white placeholder-gray-400 shadow-lg focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-500/50"
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
                    handleSendMessage()
                  }
                }}
              />
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-orange-500 hover:text-orange-400 disabled:text-gray-500"
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

export const Route = createFileRoute('/')({
  component: ChatPage,
})
