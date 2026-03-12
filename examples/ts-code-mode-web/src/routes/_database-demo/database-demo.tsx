'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { parsePartialJSON } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import type { VMEvent } from '@/components'
import {
  CodeBlock,
  ExecutionResult,
  JavaScriptVM,
  Header,
} from '@/components'
import ChatInput from '@/components/ChatInput'
import { formatDuration } from '@/lib/efficiency'

export const Route = createFileRoute('/_database-demo/database-demo' as any)({
  component: DatabaseDemoPage,
})

type Provider = 'anthropic' | 'openai' | 'gemini'

interface ModelOption {
  provider: Provider
  model: string
  label: string
}

const MODEL_OPTIONS: Array<ModelOption> = [
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-20250514',
    label: 'Claude Haiku 4',
  },
  { provider: 'openai', model: 'gpt-4o', label: 'GPT-4o' },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
  },
]

function ToolCallDisplay({
  name,
  arguments: args,
  output,
  state,
  hasResult = false,
}: {
  name: string
  arguments: string
  output?: unknown
  state: string
  hasResult?: boolean
}) {
  const isInputStreaming = state === 'input-streaming'
  const isInputComplete = state === 'input-complete'
  const hasOutput = output !== undefined || hasResult
  const isExecuting = isInputComplete && !hasOutput
  const isRunning = isInputStreaming || isExecuting

  const [inputOpen, setInputOpen] = useState(isRunning)
  const [outputOpen, setOutputOpen] = useState(false)

  let parsedArgs: unknown
  try {
    parsedArgs = JSON.parse(args)
  } catch {
    parsedArgs = args
  }

  // Get code from execute_typescript calls
  let code = ''
  if (
    name === 'execute_typescript' &&
    typeof parsedArgs === 'object' &&
    parsedArgs !== null
  ) {
    code = (parsedArgs as { typescriptCode?: string }).typescriptCode || ''
  }

  const isCodeMode = name === 'execute_typescript'
  const borderColor = isCodeMode
    ? 'border-purple-500/30'
    : 'border-emerald-500/30'
  const bgColor = isCodeMode ? 'bg-purple-900/10' : 'bg-emerald-900/10'
  const headerBg = isCodeMode ? 'bg-purple-900/20' : 'bg-emerald-900/20'
  const textColor = isCodeMode ? 'text-purple-300' : 'text-emerald-300'
  const spinnerColor = isCodeMode ? 'border-purple-400' : 'border-emerald-400'
  const pillColor = isCodeMode ? 'bg-purple-600' : 'bg-emerald-600'
  const dotColor = isCodeMode ? 'bg-purple-500/50' : 'bg-emerald-500/50'

  return (
    <div
      className={`mt-2 rounded-lg border ${borderColor} ${bgColor} overflow-hidden text-sm`}
    >
      <div
        className={`flex items-center gap-2 px-3 py-1.5 ${headerBg} ${textColor}`}
      >
        {isRunning ? (
          <div
            className={`w-3 h-3 border-2 ${spinnerColor} border-t-transparent rounded-full animate-spin`}
          />
        ) : (
          <div className={`w-3 h-3 rounded-full ${dotColor}`} />
        )}
        <span className="font-mono font-medium text-xs">{name}</span>
        {isRunning && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${pillColor} animate-pulse`}
          >
            Running...
          </span>
        )}
      </div>

      {code ? (
        <div className={`border-t ${borderColor.replace('/30', '/20')}`}>
          <button
            onClick={() => setInputOpen(!inputOpen)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5 transition-colors"
          >
            {inputOpen ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            <span>Code</span>
          </button>
          {inputOpen && (
            <pre className="px-3 pb-2 text-xs text-gray-300 overflow-x-auto max-h-48 overflow-y-auto font-mono whitespace-pre-wrap">
              {code}
            </pre>
          )}
        </div>
      ) : (
        <div className={`border-t ${borderColor.replace('/30', '/20')}`}>
          <button
            onClick={() => setInputOpen(!inputOpen)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5 transition-colors"
          >
            {inputOpen ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            <span>Input</span>
          </button>
          {inputOpen && (
            <pre className="px-3 pb-2 text-xs text-gray-300 overflow-x-auto max-h-32 overflow-y-auto font-mono whitespace-pre-wrap">
              {typeof parsedArgs === 'object'
                ? JSON.stringify(parsedArgs, null, 2)
                : String(parsedArgs)}
            </pre>
          )}
        </div>
      )}

      {hasOutput && output !== undefined && (
        <div className={`border-t ${borderColor.replace('/30', '/20')}`}>
          <button
            onClick={() => setOutputOpen(!outputOpen)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5 transition-colors"
          >
            {outputOpen ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            <span>Output</span>
          </button>
          {outputOpen && (
            <pre className="px-3 pb-2 text-xs text-gray-300 overflow-x-auto max-h-48 overflow-y-auto font-mono whitespace-pre-wrap">
              {typeof output === 'object'
                ? JSON.stringify(output, null, 2)
                : String(output)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function Messages({
  messages,
  toolCallEvents,
}: {
  messages: Array<UIMessage>
  toolCallEvents: Map<string, Array<VMEvent>>
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  if (!messages.length) return null

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
    >
      {messages.map((message) => {
        const toolResults = new Map<
          string,
          { content: string; state: string; error?: string }
        >()
        for (const p of message.parts) {
          if (p.type === 'tool-result') {
            toolResults.set(p.toolCallId, {
              content: p.content,
              state: p.state,
              error: p.error,
            })
          }
        }

        return (
          <div
            key={message.id}
            className={`rounded-lg p-4 ${
              message.role === 'user'
                ? 'bg-indigo-900/30 text-indigo-100 ml-8'
                : 'bg-gray-800/60 text-gray-100 mr-8'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-medium shrink-0 ${
                  message.role === 'assistant'
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white'
                    : 'bg-gray-700 text-white'
                }`}
              >
                {message.role === 'assistant' ? 'AI' : 'U'}
              </div>
              <div className="flex-1 min-w-0 text-sm">
                {message.parts.map((part, index) => {
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

                  // execute_typescript — use shared CodeBlock/ExecutionResult/JavaScriptVM
                  if (
                    part.type === 'tool-call' &&
                    part.name === 'execute_typescript'
                  ) {
                    let code = ''
                    const parsedArgs = parsePartialJSON(part.arguments)
                    if (parsedArgs?.typescriptCode) {
                      code = parsedArgs.typescriptCode
                    }

                    const toolResult = toolResults.get(part.id)
                    const hasOutput =
                      part.output !== undefined || toolResult !== undefined

                    let parsedOutput = part.output
                    if (!parsedOutput && toolResult?.content) {
                      try {
                        parsedOutput = JSON.parse(toolResult.content)
                      } catch {
                        parsedOutput = { result: toolResult.content }
                      }
                    }

                    const isAwaitingInput = part.state === 'awaiting-input'
                    const isInputStreaming = part.state === 'input-streaming'
                    const isInputComplete = part.state === 'input-complete'
                    const isStillGenerating =
                      isAwaitingInput || isInputStreaming
                    const isExecuting = isInputComplete && !hasOutput
                    const hasError =
                      parsedOutput?.success === false ||
                      toolResult?.error !== undefined

                    const codeStatus =
                      isStillGenerating || isExecuting
                        ? 'running'
                        : hasError
                          ? 'error'
                          : 'success'

                    const executionStatus = isExecuting
                      ? 'running'
                      : hasError
                        ? 'error'
                        : 'success'

                    const events = toolCallEvents.get(part.id) || []

                    return (
                      <div key={part.id} className="mt-3 space-y-2">
                        {!code && isStillGenerating ? (
                          <div className="rounded-lg border border-blue-700 bg-blue-900/30 overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3">
                              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                              <span className="text-blue-300 font-medium">
                                LLM is generating the TypeScript code...
                              </span>
                            </div>
                          </div>
                        ) : (
                          <CodeBlock code={code} status={codeStatus} />
                        )}
                        {isInputComplete &&
                          (events.length > 0 || isExecuting) && (
                            <JavaScriptVM
                              events={events}
                              isExecuting={isExecuting}
                            />
                          )}
                        {isInputComplete && (
                          <ExecutionResult
                            status={executionStatus}
                            result={parsedOutput?.result}
                            error={
                              parsedOutput?.error?.message || toolResult?.error
                            }
                            logs={parsedOutput?.logs}
                          />
                        )}
                      </div>
                    )
                  }

                  // Other tool calls — generic display
                  if (part.type === 'tool-call') {
                    const toolResult = toolResults.get(part.id)
                    const effectiveOutput =
                      part.output ??
                      (toolResult?.content
                        ? (() => {
                            try {
                              return JSON.parse(toolResult.content)
                            } catch {
                              return toolResult.content
                            }
                          })()
                        : undefined)

                    return (
                      <ToolCallDisplay
                        key={part.id}
                        name={part.name}
                        arguments={part.arguments}
                        output={effectiveOutput}
                        state={part.state}
                        hasResult={toolResult !== undefined}
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
    </div>
  )
}

// Schema display sidebar
function SchemaPanel() {
  return (
    <div className="p-4 space-y-4 text-sm">
      <div>
        <h3 className="text-emerald-400 font-semibold mb-2">customers</h3>
        <div className="space-y-1 text-gray-300 font-mono text-xs">
          <div>
            <span className="text-gray-500">id</span> number
          </div>
          <div>
            <span className="text-gray-500">name</span> string
          </div>
          <div>
            <span className="text-gray-500">email</span> string
          </div>
          <div>
            <span className="text-gray-500">city</span> string
          </div>
          <div>
            <span className="text-gray-500">joined</span> date
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-1">10 rows</div>
      </div>

      <div>
        <h3 className="text-emerald-400 font-semibold mb-2">products</h3>
        <div className="space-y-1 text-gray-300 font-mono text-xs">
          <div>
            <span className="text-gray-500">id</span> number
          </div>
          <div>
            <span className="text-gray-500">name</span> string
          </div>
          <div>
            <span className="text-gray-500">category</span> string
          </div>
          <div>
            <span className="text-gray-500">price</span> number
          </div>
          <div>
            <span className="text-gray-500">stock</span> number
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-1">10 rows</div>
      </div>

      <div>
        <h3 className="text-emerald-400 font-semibold mb-2">purchases</h3>
        <div className="space-y-1 text-gray-300 font-mono text-xs">
          <div>
            <span className="text-gray-500">id</span> number
          </div>
          <div>
            <span className="text-gray-500">customer_id</span> number
          </div>
          <div>
            <span className="text-gray-500">product_id</span> number
          </div>
          <div>
            <span className="text-gray-500">quantity</span> number
          </div>
          <div>
            <span className="text-gray-500">total</span> number
          </div>
          <div>
            <span className="text-gray-500">purchased_at</span> date
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-1">25 rows</div>
      </div>
    </div>
  )
}

const EXAMPLE_QUERIES = [
  'For each city, show the total revenue, number of unique customers, and the most purchased product category',
  'Rank every customer by total spending and show what percentage of their purchases were electronics vs furniture vs office products',
  'Show a monthly breakdown of purchases with total revenue, average order value, and the number of distinct products sold each month',
  'Which customers have purchased from all three product categories? Show their names, cities, and total spend per category',
  'Find the top 3 products by revenue and for each one list every customer who bought it, their city, and how many units they ordered',
  'Compare average order value across cities and product categories — which city-category combination has the highest spend?',
]

interface MessageMetrics {
  query: string
  codeMode: boolean
  llmCalls: number
  toolCalls: number
  durationMs: number | null
}

function MetricsSidebar({ entries }: { entries: Array<MessageMetrics> }) {
  return (
    <div className="w-72 flex flex-col border-l border-gray-800 bg-gray-900/50">
      <div className="p-4 border-b border-gray-800">
        <div className="text-sm font-semibold text-white">Metrics</div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {entries.length === 0 && (
          <div className="text-xs text-gray-500">
            Metrics will appear here after each response.
          </div>
        )}
        {entries.map((entry, i) => (
          <div
            key={i}
            className={`rounded-lg border p-3 text-xs ${
              entry.codeMode
                ? 'border-purple-500/30 bg-purple-900/10'
                : 'border-amber-500/30 bg-amber-900/10'
            }`}
          >
            <div className="text-gray-300 font-medium mb-2 line-clamp-2">
              {entry.query}
            </div>
            <div
              className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mb-2 ${
                entry.codeMode
                  ? 'bg-purple-600/50 text-purple-200'
                  : 'bg-amber-600/50 text-amber-200'
              }`}
            >
              {entry.codeMode ? 'Code Mode' : 'Direct Tools'}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-gray-500">LLM Calls</div>
                <div className="text-white font-mono font-semibold">
                  {entry.llmCalls}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Tool Calls</div>
                <div className="text-white font-mono font-semibold">
                  {entry.toolCalls}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Time</div>
                <div className="text-white font-mono font-semibold">
                  {entry.durationMs !== null
                    ? formatDuration(entry.durationMs)
                    : '...'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DatabaseDemoPage() {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(
    MODEL_OPTIONS[0],
  )
  const [useCodeMode, setUseCodeMode] = useState(true)
  const [toolCallEvents, setToolCallEvents] = useState<
    Map<string, Array<VMEvent>>
  >(new Map())
  const eventIdCounter = useRef(0)

  // Per-message metrics tracking
  const [metricsEntries, setMetricsEntries] = useState<Array<MessageMetrics>>([])
  const pendingMetricsRef = useRef<{
    llmCalls: number
    durationMs: number | null
    codeMode: boolean
  } | null>(null)
  const wasLoadingRef = useRef(false)
  const useCodeModeRef = useRef(useCodeMode)
  useCodeModeRef.current = useCodeMode

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
      useCodeMode,
    }),
    [selectedModel.provider, selectedModel.model, useCodeMode],
  )

  const handleCustomEvent = useCallback(
    (eventType: string, data: unknown, context: { toolCallId?: string }) => {
      // Track metrics events
      if (eventType === 'db_demo:chat_start') {
        pendingMetricsRef.current = {
          llmCalls: 0,
          durationMs: null,
          codeMode: useCodeModeRef.current,
        }
        return
      }

      if (eventType === 'db_demo:llm_call') {
        if (pendingMetricsRef.current && data && typeof data === 'object' && 'count' in data) {
          const count = (data as { count?: number }).count
          if (typeof count === 'number') {
            pendingMetricsRef.current.llmCalls = count
          }
        }
        return
      }

      if (eventType === 'db_demo:chat_end') {
        if (pendingMetricsRef.current && data && typeof data === 'object' && 'durationMs' in data) {
          const dur = (data as { durationMs?: number }).durationMs
          if (typeof dur === 'number') {
            pendingMetricsRef.current.durationMs = dur
          }
        }
        return
      }

      // VM events for tool call display
      const toolCallId = context.toolCallId
      if (!toolCallId) return

      const event: VMEvent = {
        id: `event-${eventIdCounter.current++}`,
        eventType,
        data,
        timestamp: Date.now(),
      }

      setToolCallEvents((prev) => {
        const newMap = new Map(prev)
        const events = newMap.get(toolCallId) || []
        newMap.set(toolCallId, [...events, event])
        return newMap
      })
    },
    [],
  )

  const { messages, sendMessage, setMessages, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/database-demo'),
    body,
    onCustomEvent: handleCustomEvent,
  })

  // Finalize metrics entry when isLoading transitions from true → false
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && pendingMetricsRef.current) {
      const pending = pendingMetricsRef.current
      pendingMetricsRef.current = null

      // Find the user message that triggered this response
      const userMessages = messages.filter((m) => m.role === 'user')
      const lastUserMessage = userMessages[userMessages.length - 1]
      const query =
        lastUserMessage?.parts.find((p) => p.type === 'text')?.content ||
        'Unknown query'

      // Count tool calls from the latest assistant message
      const lastAssistantMessage = [...messages]
        .reverse()
        .find((m) => m.role === 'assistant')
      const toolCalls = lastAssistantMessage
        ? lastAssistantMessage.parts.filter((p) => p.type === 'tool-call').length
        : 0

      setMetricsEntries((prev) => [
        ...prev,
        {
          query,
          codeMode: pending.codeMode,
          llmCalls: pending.llmCalls,
          toolCalls,
          durationMs: pending.durationMs,
        },
      ])
    }
    wasLoadingRef.current = isLoading
  }, [isLoading, messages])

  const clearMessages = useCallback(() => {
    setMessages([])
    setToolCallEvents(new Map())
  }, [setMessages])

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-64 flex flex-col border-r border-gray-800 bg-gray-900/50">
          <div className="p-4 border-b border-gray-800">
            <div className="text-sm font-semibold text-white mb-3">
              Database Schema
            </div>
            <SchemaPanel />
          </div>

          <div className="p-4 border-b border-gray-800">
            <div className="text-sm font-semibold text-white mb-2">
              Settings
            </div>
            <select
              value={MODEL_OPTIONS.findIndex(
                (opt) =>
                  opt.provider === selectedModel.provider &&
                  opt.model === selectedModel.model,
              )}
              onChange={(e) => {
                const option = MODEL_OPTIONS[parseInt(e.target.value)]
                setSelectedModel(option)
              }}
              disabled={isLoading}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50 mb-2"
            >
              {MODEL_OPTIONS.map((option, index) => (
                <option key={index} value={index}>
                  {option.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={useCodeMode}
                onChange={(e) => setUseCodeMode(e.target.checked)}
                disabled={isLoading}
                className="rounded border-gray-600 bg-gray-800 text-emerald-500 focus:ring-emerald-500/50"
              />
              Code Mode
            </label>
            <button
              onClick={clearMessages}
              disabled={isLoading || messages.length === 0}
              className="w-full text-xs px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800/50 text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Clear Chat
            </button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            <div className="text-sm font-semibold text-white mb-2">
              Try These
            </div>
            <div className="flex flex-col gap-2">
              {EXAMPLE_QUERIES.map((query) => (
                <button
                  key={query}
                  onClick={() => sendMessage(query)}
                  disabled={isLoading}
                  className="text-left text-xs p-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 text-gray-300 disabled:opacity-60 transition-colors"
                >
                  {query}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col">
          {messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center px-8">
              <div className="text-center max-w-md">
                <div className="text-4xl mb-4">
                  <span role="img" aria-label="database">
                    {''}
                  </span>
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">
                  Database Query Demo
                </h2>
                <p className="text-sm text-gray-400 mb-6">
                  Ask questions about customers, products, and purchases. The AI
                  will query the in-memory database to find answers.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {EXAMPLE_QUERIES.slice(0, 4).map((query) => (
                    <button
                      key={query}
                      onClick={() => sendMessage(query)}
                      disabled={isLoading}
                      className="text-left text-xs p-3 rounded-lg bg-gray-800/60 hover:bg-gray-800 text-gray-300 disabled:opacity-60 border border-gray-700/50 transition-colors"
                    >
                      {query}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <Messages messages={messages} toolCallEvents={toolCallEvents} />
          )}

          <ChatInput
            onSend={(content) => sendMessage(content)}
            disabled={isLoading}
            placeholder="Ask about customers, products, or purchases..."
            exampleQueries={
              '"Top customers by spending" | "Most popular products" | "Revenue by category"'
            }
          />
        </div>

        {/* Right sidebar — Metrics */}
        <MetricsSidebar entries={metricsEntries} />
      </div>
    </div>
  )
}
