import { useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Check, Loader2, Send, Square, Wrench } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { ThinkingPart } from '@tanstack/ai-react-ui'
import type { UIMessage } from '@tanstack/ai-react'
import { MCP_PROVIDERS, type McpProvider } from '@/lib/mcp-providers'

type McpMode = 'manual' | 'chat' | 'pool'

const MODES: Array<{
  value: McpMode
  label: string
  endpoint: string
  description: string
}> = [
  {
    value: 'manual',
    label: 'Manual',
    endpoint: '/api/mcp-manual',
    description:
      'Manually spread tools + inject resources/prompts as context before user messages.',
  },
  {
    value: 'chat',
    label: 'chat({ mcp })',
    endpoint: '/api/mcp-chat',
    description:
      'Pass MCP clients directly to chat(); it handles tool discovery and lifecycle.',
  },
  {
    value: 'pool',
    label: 'Pool',
    endpoint: '/api/mcp-pool',
    description:
      'createMCPClients() spins up a 3-server pool with auto-prefixed tool names.',
  },
]

type ToolCallPart = Extract<UIMessage['parts'][number], { type: 'tool-call' }>
type ToolResultPart = Extract<
  UIMessage['parts'][number],
  { type: 'tool-result' }
>

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** Renders an MCP (or any) tool call: name, arguments, live state, and result. */
function ToolCallView({ part }: { part: ToolCallPart }) {
  let args: unknown = part.input
  if (args === undefined && part.arguments) {
    try {
      args = JSON.parse(part.arguments)
    } catch {
      args = part.arguments
    }
  }
  const done = part.state === 'complete' || part.output !== undefined

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-cyan-500/30 bg-cyan-500/5">
      <div className="flex items-center gap-2 border-b border-cyan-500/20 bg-cyan-500/10 px-3 py-2">
        <Wrench className="h-3.5 w-3.5 text-cyan-400" />
        <span className="font-mono text-sm text-cyan-300">{part.name}</span>
        <span className="ml-auto flex items-center gap-1 text-xs text-gray-400">
          {done ? (
            <>
              <Check className="h-3 w-3 text-green-400" /> done
            </>
          ) : (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> {part.state}
            </>
          )}
        </span>
      </div>
      <div className="space-y-2 px-3 py-2">
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
            Arguments
          </p>
          <pre className="overflow-x-auto rounded bg-gray-900/60 p-2 text-xs text-gray-300">
            {formatValue(args ?? {})}
          </pre>
        </div>
        {part.output !== undefined && (
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
              Result
            </p>
            <pre className="max-h-60 overflow-auto rounded bg-gray-900/60 p-2 text-xs text-emerald-200">
              {formatValue(part.output)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

/** Renders a standalone tool-result part (when emitted separately from the call). */
function ToolResultView({ part }: { part: ToolResultPart }) {
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-emerald-500/30 bg-emerald-500/5">
      <div className="flex items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
        <Check className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-sm text-emerald-300">Tool result</span>
        {part.state === 'error' && (
          <span className="ml-auto text-xs text-red-400">error</span>
        )}
      </div>
      <pre className="max-h-60 overflow-auto px-3 py-2 text-xs text-emerald-200">
        {part.error ?? formatValue(part.content)}
      </pre>
    </div>
  )
}

function Messages({ messages }: { messages: Array<UIMessage> }) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const visibleMessages = messages.filter((message) =>
    message.parts.some(
      (part) =>
        (part.type === 'text' && part.content.trim()) ||
        part.type === 'thinking' ||
        part.type === 'tool-call' ||
        part.type === 'tool-result',
    ),
  )

  if (!visibleMessages.length) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-gray-400 text-sm">
            Select a mode above and send a message to try it out.
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
          className={`p-4 rounded-lg mb-2 ${
            message.role === 'assistant'
              ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
              : 'bg-transparent'
          }`}
        >
          <div className="flex items-start gap-4">
            {message.role === 'assistant' ? (
              <div className="w-8 h-8 rounded-lg bg-linear-to-r from-orange-500 to-red-600 flex items-center justify-center text-sm font-medium text-white shrink-0">
                AI
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-sm font-medium text-white shrink-0">
                U
              </div>
            )}
            <div className="flex-1 min-w-0">
              {message.parts.map((part, index) => {
                if (part.type === 'thinking') {
                  const isComplete = message.parts
                    .slice(index + 1)
                    .some((p) => p.type === 'text')
                  return (
                    <div key={`thinking-${index}`} className="mt-2 mb-2">
                      <ThinkingPart
                        content={part.content}
                        isComplete={isComplete}
                        className="p-4 bg-gray-800/50 border border-gray-700/50 rounded-lg"
                      />
                    </div>
                  )
                }

                if (part.type === 'text' && part.content) {
                  return (
                    <div
                      key={`text-${index}`}
                      className="text-white prose dark:prose-invert max-w-none"
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

                if (part.type === 'tool-call') {
                  return <ToolCallView key={`tool-${index}`} part={part} />
                }

                if (part.type === 'tool-result') {
                  return <ToolResultView key={`result-${index}`} part={part} />
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

function ChatSurface({
  endpoint,
  threadId,
  provider,
}: {
  endpoint: string
  threadId: string
  provider: McpProvider
}) {
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    // A stable threadId is sent to the server (AG-UI `RunAgentInput.threadId`)
    // and used to group this conversation's runs in the TanStack AI devtools.
    threadId,
    connection: fetchServerSentEvents(endpoint),
    // `provider` is forwarded to the route (AG-UI forwardedProps); the route
    // resolves it to the matching text adapter. MCP works the same regardless.
    body: { provider },
  })

  const [input, setInput] = useState('')

  const handleSend = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Messages messages={messages} />

      {error && (
        <div className="mx-4 mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error.message}
        </div>
      )}

      <div className="border-t border-orange-500/10 bg-gray-900/80 backdrop-blur-sm">
        <div className="w-full px-4 py-3 space-y-2">
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
          <div className="relative flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask the MCP servers something..."
                className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 pl-4 pr-12 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-transparent resize-none overflow-hidden shadow-lg"
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
                    handleSend()
                  }
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-orange-500 hover:text-orange-400 disabled:text-gray-500 transition-colors focus:outline-none"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function McpDemoPage() {
  const [mode, setMode] = useState<McpMode>('manual')
  const [provider, setProvider] = useState<McpProvider>('openrouter')

  const selectedMode = MODES.find((m) => m.value === mode)!
  const selectedProvider = MCP_PROVIDERS.find((p) => p.value === provider)!

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gray-900">
      {/* Header / mode + provider selectors */}
      <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3 shrink-0">
        <p className="text-xs text-gray-400 mb-3">
          These chat against keyless MCP reference servers (server-everything /
          -memory / -sequential-thinking) spawned via stdio. The MCP servers
          need no keys — but the selected LLM provider does (set{' '}
          <code className="text-gray-300">{selectedProvider.envKey}</code> in
          your environment). First run downloads the servers via npx.
        </p>

        <div className="flex gap-2 flex-wrap">
          {MODES.map((m) => (
            <label
              key={m.value}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                mode === m.value
                  ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                  : 'border-gray-600 bg-gray-700/50 text-gray-300 hover:border-orange-500/50'
              }`}
            >
              <input
                type="radio"
                name="mcp-mode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
                className="sr-only"
              />
              <span className="font-medium">{m.label}</span>
            </label>
          ))}
        </div>

        {/* Provider selector — MCP tool discovery/execution is provider-agnostic */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wide text-gray-500">
            Provider
          </span>
          {MCP_PROVIDERS.map((p) => (
            <label
              key={p.value}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors text-sm ${
                provider === p.value
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                  : 'border-gray-600 bg-gray-700/50 text-gray-300 hover:border-cyan-500/50'
              }`}
            >
              <input
                type="radio"
                name="mcp-provider"
                value={p.value}
                checked={provider === p.value}
                onChange={() => setProvider(p.value)}
                className="sr-only"
              />
              <span className="font-medium">{p.label}</span>
              <span className="text-xs text-gray-500">{p.model}</span>
            </label>
          ))}
        </div>

        <p className="mt-2 text-xs text-gray-400">{selectedMode.description}</p>
      </div>

      {/* Remount the chat surface on mode/provider change so each combo gets a fresh session */}
      <ChatSurface
        key={`${mode}-${provider}`}
        endpoint={selectedMode.endpoint}
        threadId={`mcp-${mode}-${provider}`}
        provider={provider}
      />
    </div>
  )
}

export const Route = createFileRoute('/mcp-demo')({
  component: McpDemoPage,
})
