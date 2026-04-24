import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  FlaskConical,
  Monitor,
  Send,
  Server,
  ShieldCheck,
  Square,
  Zap,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { clientTools } from '@tanstack/ai-client'

import type { UIMessage } from '@tanstack/ai-react'

import {
  clientServerToolDef,
  clientServerToolWithApprovalDef,
  clientToolDef,
  clientToolWithApprovalDef,
  createClientResult,
} from '@/lib/simulator-tools'

// Client tool implementations
const clientToolClient = clientToolDef.client((args) =>
  createClientResult('clientTool', args),
)

const clientToolWithApprovalClient = clientToolWithApprovalDef.client((args) =>
  createClientResult('clientToolWithApproval', args),
)

const clientServerToolClient = clientServerToolDef.client((args) =>
  createClientResult('clientServerTool', args),
)

const clientServerToolWithApprovalClient =
  clientServerToolWithApprovalDef.client((args) =>
    createClientResult('clientServerToolWithApproval', args),
  )

const tools = clientTools(
  clientToolClient,
  clientToolWithApprovalClient,
  clientServerToolClient,
  clientServerToolWithApprovalClient,
)

// Static Tailwind class mappings for JIT compatibility
const categoryColors: Record<string, { text: string; hoverBorder: string }> = {
  cyan: { text: 'text-cyan-400', hoverBorder: 'hover:border-cyan-500/30' },
  purple: {
    text: 'text-purple-400',
    hoverBorder: 'hover:border-purple-500/30',
  },
  yellow: {
    text: 'text-yellow-400',
    hoverBorder: 'hover:border-yellow-500/30',
  },
  green: { text: 'text-green-400', hoverBorder: 'hover:border-green-500/30' },
}

// Tool injection templates
const TOOL_TEMPLATES = [
  {
    category: 'Server Tools',
    icon: Server,
    color: 'cyan',
    tools: [
      {
        name: 'Server Tool',
        template: 'serverTool({ text: "hello from server" })',
        description: 'Executes on server only',
      },
      {
        name: 'Server + Approval',
        template: 'serverToolWithApproval({ text: "needs approval" })',
        description: 'Server execution with approval',
      },
    ],
  },
  {
    category: 'Client Tools',
    icon: Monitor,
    color: 'purple',
    tools: [
      {
        name: 'Client Tool',
        template: 'clientTool({ text: "hello from client" })',
        description: 'Executes in browser only',
      },
      {
        name: 'Client + Approval',
        template: 'clientToolWithApproval({ text: "client needs approval" })',
        description: 'Client execution with approval',
      },
    ],
  },
  {
    category: 'Hybrid Tools',
    icon: Zap,
    color: 'yellow',
    tools: [
      {
        name: 'Client/Server Tool',
        template: 'clientServerTool({ text: "hybrid tool" })',
        description: 'Client takes precedence over server',
      },
      {
        name: 'Hybrid + Approval',
        template: 'clientServerToolWithApproval({ text: "hybrid approval" })',
        description: 'Hybrid with approval required',
      },
    ],
  },
  {
    category: 'Delayed Calls',
    icon: ShieldCheck,
    color: 'green',
    tools: [
      {
        name: '2s Delay',
        template: 'serverTool({ text: "delayed", delay: 2 })',
        description: 'Server tool with 2 second delay',
      },
      {
        name: 'Multi-Tool',
        template:
          'serverTool({ text: "first" })\nclientTool({ text: "second" })',
        description: 'Multiple tool calls',
      },
    ],
  },
]

function ChatInputArea({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-purple-500/10 bg-gray-900/80 backdrop-blur-sm">
      <div className="w-full px-4 py-3">{children}</div>
    </div>
  )
}

function Messages({
  messages,
  addToolApprovalResponse,
}: {
  messages: Array<UIMessage>
  addToolApprovalResponse: (response: {
    id: string
    approved: boolean
  }) => Promise<void>
}) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight
    }
  }, [messages])

  if (!messages.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <FlaskConical className="w-16 h-16 mx-auto mb-4 text-purple-500/50" />
          <p className="text-lg font-medium">Tool Simulator</p>
          <p className="text-sm mt-2">
            Type a message or use the buttons below to inject tool calls
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
      {messages.map(({ id, role, parts }) => {
        return (
          <div
            key={id}
            className={`p-4 rounded-lg mb-2 ${
              role === 'assistant'
                ? 'bg-linear-to-r from-purple-500/5 to-cyan-600/5'
                : 'bg-transparent'
            }`}
          >
            <div className="flex items-start gap-4">
              {role === 'assistant' ? (
                <div className="w-8 h-8 rounded-lg bg-linear-to-r from-purple-500 to-cyan-600 flex items-center justify-center text-sm font-medium text-white shrink-0">
                  🤖
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-sm font-medium text-white shrink-0">
                  U
                </div>
              )}
              <div className="flex-1 min-w-0">
                {parts.map((part, index) => {
                  if (part.type === 'text' && part.content) {
                    return (
                      <div
                        key={`text-${index}`}
                        className="text-white prose dark:prose-invert max-w-none"
                      >
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

                  // Tool call display
                  if (part.type === 'tool-call') {
                    const isApprovalRequired =
                      part.state === 'approval-requested' && part.approval

                    // Approval UI
                    if (isApprovalRequired) {
                      return (
                        <div
                          key={part.id}
                          className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mt-2"
                        >
                          <p className="text-white font-medium mb-2">
                            🔒 Approval Required: {part.name}
                          </p>
                          <div className="text-gray-300 text-sm mb-3">
                            <pre className="bg-gray-800 p-2 rounded text-xs overflow-x-auto">
                              {JSON.stringify(
                                (() => {
                                  try {
                                    return JSON.parse(part.arguments)
                                  } catch {
                                    return part.arguments
                                  }
                                })(),
                                null,
                                2,
                              )}
                            </pre>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                addToolApprovalResponse({
                                  id: part.approval!.id,
                                  approved: true,
                                })
                              }
                              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() =>
                                addToolApprovalResponse({
                                  id: part.approval!.id,
                                  approved: false,
                                })
                              }
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                              ✗ Deny
                            </button>
                          </div>
                        </div>
                      )
                    }

                    // Regular tool call (completed or in progress)
                    const hasOutput = part.output !== undefined
                    const hasError = part.output?.error !== undefined

                    const getStateColor = () => {
                      if (hasError) return 'bg-red-500/10 border-red-500/30'
                      if (hasOutput)
                        return 'bg-green-500/10 border-green-500/30'
                      if (
                        part.state === 'input-streaming' ||
                        part.state === 'input-complete'
                      ) {
                        return 'bg-blue-500/10 border-blue-500/30'
                      }
                      return 'bg-gray-800/50 border-gray-700/50'
                    }

                    const getStatusDisplay = () => {
                      if (hasError) return 'error'
                      if (hasOutput) return 'complete'
                      return part.state
                    }

                    return (
                      <div
                        key={part.id}
                        className={`p-3 rounded-lg mt-2 border ${getStateColor()}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Zap className="w-4 h-4 text-purple-400" />
                          <span className="text-white font-medium text-sm">
                            {part.name}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              hasOutput
                                ? 'bg-green-500/20 text-green-400'
                                : hasError
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'bg-blue-500/20 text-blue-400'
                            }`}
                          >
                            {getStatusDisplay()}
                          </span>
                        </div>
                        <pre className="text-xs text-gray-400 bg-gray-900/50 p-2 rounded overflow-x-auto">
                          <span className="text-gray-500">Args: </span>
                          {part.arguments}
                        </pre>
                        {part.output && (
                          <pre className="text-xs text-green-400 bg-gray-900/50 p-2 rounded mt-2 overflow-x-auto">
                            <span className="text-gray-500">Output: </span>
                            {JSON.stringify(part.output, null, 2)}
                          </pre>
                        )}
                      </div>
                    )
                  }

                  return null
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DebugPanel({
  messages,
  chunks,
  onClearChunks,
}: {
  messages: Array<UIMessage>
  chunks: Array<any>
  onClearChunks: () => void
}) {
  const [activeTab, setActiveTab] = useState<'messages' | 'chunks'>('messages')

  const exportToTypeScript = () => {
    const tsCode = `const rawChunks = ${JSON.stringify(chunks, null, 2)};`
    navigator.clipboard.writeText(tsCode)
    alert('TypeScript code copied to clipboard!')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-purple-500/20">
        <h2 className="text-white font-semibold text-lg">Debug Panel</h2>
        <p className="text-gray-400 text-sm mt-1">
          View messages and raw stream chunks
        </p>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setActiveTab('messages')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'messages'
                ? 'bg-purple-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Messages
          </button>
          <button
            onClick={() => setActiveTab('chunks')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'chunks'
                ? 'bg-purple-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Raw Chunks ({chunks.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'messages' && (
          <div>
            <pre className="text-xs text-gray-300 font-mono bg-gray-800 p-4 rounded-lg overflow-x-auto">
              {JSON.stringify(messages, null, 2)}
            </pre>
          </div>
        )}

        {activeTab === 'chunks' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                onClick={exportToTypeScript}
                disabled={chunks.length === 0}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                📋 Export to TypeScript
              </button>
              <button
                onClick={onClearChunks}
                disabled={chunks.length === 0}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                🗑️ Clear Chunks
              </button>
            </div>

            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-900 text-gray-400 uppercase">
                  <tr>
                    <th className="px-4 py-3 w-32">Type</th>
                    <th className="px-4 py-3 w-32">Tool Name</th>
                    <th className="px-4 py-3">Detail</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {chunks.map((chunk, idx) => {
                    const toolName = chunk.toolCall?.function?.name || '-'

                    let detail = '-'
                    if (chunk.type === 'content' && chunk.content) {
                      detail = chunk.content
                    } else if (
                      chunk.type === 'tool_call' &&
                      chunk.toolCall?.function?.arguments
                    ) {
                      detail = chunk.toolCall.function.arguments
                    } else if (chunk.type === 'tool_result' && chunk.content) {
                      detail = chunk.content
                    } else if (chunk.type === 'done') {
                      detail = `Finish: ${chunk.finishReason || 'unknown'}`
                    } else if (chunk.type === 'approval-requested') {
                      detail = `Approval for: ${chunk.toolName}`
                    } else if (chunk.type === 'tool-input-available') {
                      detail = `Input ready for: ${chunk.toolName}`
                    }

                    if (detail.length > 150) {
                      detail = detail.substring(0, 150) + '...'
                    }

                    return (
                      <tr
                        key={idx}
                        className="border-b border-gray-700 hover:bg-gray-750"
                      >
                        <td className="px-4 py-3 font-medium">{chunk.type}</td>
                        <td className="px-4 py-3">{toolName}</td>
                        <td className="px-4 py-3 font-mono text-xs break-all">
                          {detail}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ToolInjectionPanel({
  onInject,
}: {
  onInject: (template: string) => void
}) {
  return (
    <div className="border-t border-purple-500/20 bg-gray-900/50 p-4">
      <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-purple-400" />
        Quick Inject Tool Calls
      </h3>
      <div className="grid grid-cols-2 gap-4">
        {TOOL_TEMPLATES.map((category) => (
          <div key={category.category}>
            <div className="flex items-center gap-2 mb-2">
              <category.icon
                className={`w-3 h-3 ${categoryColors[category.color].text}`}
              />
              <span className="text-xs font-medium text-gray-400 uppercase">
                {category.category}
              </span>
            </div>
            <div className="space-y-1">
              {category.tools.map((tool) => (
                <button
                  key={tool.name}
                  onClick={() => onInject(tool.template)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700/50 ${categoryColors[category.color].hoverBorder}`}
                  title={tool.description}
                >
                  <span className="text-white font-medium">{tool.name}</span>
                  <span className="text-gray-500 text-xs block truncate">
                    {tool.template.split('\n')[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SimulatorPage() {
  const [chunks, setChunks] = useState<Array<any>>([])
  const [input, setInput] = useState('')

  const { messages, sendMessage, isLoading, addToolApprovalResponse, stop } =
    useChat({
      connection: fetchServerSentEvents('/api/simulator-chat'),
      tools,
      onChunk: (chunk: any) => {
        setChunks((prev) => [...prev, chunk])
      },
    })

  const clearChunks = () => setChunks([])

  const handleInject = (template: string) => {
    setInput((prev) => (prev ? `${prev}\n${template}` : template))
  }

  return (
    <div className="flex h-[calc(100vh-72px)] bg-gray-900">
      {/* Left side - Chat (1/2 width) */}
      <div className="w-1/2 flex flex-col border-r border-purple-500/20">
        {/* Header bar */}
        <div className="border-b border-purple-500/20 bg-gray-800 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-purple-400" />
              <h1 className="text-white font-semibold">Tool Simulator</h1>
            </div>
            <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-400 rounded">
              Mock LLM
            </span>
          </div>
          <p className="text-gray-400 text-xs mt-1">
            Test tool execution flows with a simulated LLM. Use the syntax:{' '}
            <code className="bg-gray-700 px-1 rounded">
              toolName({'{ args }'})
            </code>
          </p>
        </div>

        <Messages
          messages={messages}
          addToolApprovalResponse={addToolApprovalResponse}
        />

        <ToolInjectionPanel onInject={handleInject} />

        <ChatInputArea>
          <div className="space-y-3">
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
                placeholder="Type a message or tool call like: serverTool({ text: 'hello' })"
                className="w-full rounded-lg border border-purple-500/20 bg-gray-800/50 pl-4 pr-12 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent resize-none overflow-hidden shadow-lg"
                rows={2}
                style={{ minHeight: '60px', maxHeight: '200px' }}
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
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-purple-500 hover:text-purple-400 disabled:text-gray-500 transition-colors focus:outline-none"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </ChatInputArea>
      </div>

      <div className="w-1/2 bg-gray-950 flex flex-col">
        <DebugPanel
          messages={messages}
          chunks={chunks}
          onClearChunks={clearChunks}
        />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/simulator')({
  component: SimulatorPage,
})
