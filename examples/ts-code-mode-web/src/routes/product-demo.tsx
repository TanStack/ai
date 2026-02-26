import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronRight,
  Send,
  Sparkles,
  Square,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { parsePartialJSON } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import type { VMEvent } from '@/components'
import { CodeBlock, ExecutionResult, JavaScriptVM, Header } from '@/components'
import { formatBytes, formatDuration } from '@/lib/efficiency'

export const Route = createFileRoute('/product-demo')({
  component: ProductDemoPage,
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

const PROMPT_SUGGESTIONS = [
  {
    label: 'Average Cost',
    prompt: 'What is the average cost of our shoes?',
  },
  {
    label: 'Most Expensive',
    prompt: 'What is the most expensive shoe?',
  },
]

// --- Scorecard ---

function ScoreCard({
  llmCalls,
  toolCalls,
  contextBytes,
  durationMs,
}: {
  llmCalls: number
  toolCalls: number
  contextBytes: number
  durationMs: number | null
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-2 text-xs border-b border-gray-700/50 bg-gray-800/40 whitespace-nowrap overflow-x-auto">
      <Stat label="LLM Calls" value={llmCalls} />
      <Stat label="Tool Calls" value={toolCalls} />
      <Stat
        label="Context"
        value={contextBytes > 0 ? formatBytes(contextBytes) : '—'}
      />
      <Stat
        label="Duration"
        value={durationMs !== null ? formatDuration(durationMs) : '—'}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-500">{label}:</span>
      <span className="font-mono text-gray-200 font-medium">
        {String(value)}
      </span>
    </div>
  )
}

// --- ToolCallDisplay (for regular tools panel) ---

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
  const [outputOpen, setOutputOpen] = useState(isRunning)
  const [userControlledInput, setUserControlledInput] = useState(false)
  const [userControlledOutput, setUserControlledOutput] = useState(false)
  const prevOutputRef = useRef(output)

  useEffect(() => {
    const hadNoOutput = prevOutputRef.current === undefined
    const hasOutputNow = output !== undefined

    if (hadNoOutput && hasOutputNow) {
      if (!userControlledInput) setInputOpen(false)
      if (!userControlledOutput) setOutputOpen(false)
    }
    prevOutputRef.current = output
  }, [output, userControlledInput, userControlledOutput])

  let parsedArgs: unknown
  try {
    parsedArgs = JSON.parse(args)
  } catch {
    parsedArgs = args
  }

  return (
    <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-900/10 overflow-hidden text-xs">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-900/20 text-amber-300">
        {isRunning ? (
          <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className="w-3 h-3 rounded-full bg-amber-500/50" />
        )}
        <span className="font-mono font-medium">{name}</span>
        {isRunning && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-600 animate-pulse">
            Running...
          </span>
        )}
      </div>

      <div className="border-t border-amber-500/20">
        <button
          onClick={() => {
            setUserControlledInput(true)
            setInputOpen(!inputOpen)
          }}
          className="w-full flex items-center gap-1.5 px-3 py-1 text-[10px] text-gray-400 hover:bg-white/5 transition-colors"
        >
          {inputOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>Input</span>
        </button>
        {inputOpen && (
          <pre className="px-3 pb-2 text-[10px] text-gray-300 overflow-x-auto max-h-32 overflow-y-auto">
            {typeof parsedArgs === 'string'
              ? parsedArgs
              : JSON.stringify(parsedArgs, null, 2)}
          </pre>
        )}
      </div>

      {(isExecuting || output !== undefined) && (
        <div className="border-t border-amber-500/20">
          <button
            onClick={() => {
              setUserControlledOutput(true)
              setOutputOpen(!outputOpen)
            }}
            className="w-full flex items-center gap-1.5 px-3 py-1 text-[10px] text-gray-400 hover:bg-white/5 transition-colors"
          >
            {outputOpen ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            <span>Output</span>
            {isExecuting && (
              <div className="w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin ml-1" />
            )}
          </button>
          {outputOpen && (
            <div className="px-3 pb-2">
              {isExecuting ? (
                <div className="flex items-center gap-2 text-[10px] text-amber-300">
                  <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <span>Executing...</span>
                </div>
              ) : (
                <pre className="text-[10px] text-gray-300 overflow-x-auto max-h-32 overflow-y-auto">
                  {typeof output === 'string'
                    ? output
                    : JSON.stringify(output, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Message renderers (shared between panels) ---

function MessageMarkdown({ content }: { content: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// --- Code Mode Panel (isolated useChat) ---

function CodeModePanel({
  body,
  promptRef,
  triggerCount,
  onLoadingChange,
}: {
  body: { provider: string; model: string }
  promptRef: React.RefObject<string>
  triggerCount: number
  onLoadingChange: (loading: boolean) => void
}) {
  const [llmCalls, setLlmCalls] = useState(0)
  const [contextBytes, setContextBytes] = useState(0)
  const [timeMs, setTimeMs] = useState<number | null>(null)
  const [toolCallEvents, setToolCallEvents] = useState<
    Map<string, Array<VMEvent>>
  >(new Map())
  const eventIdCounter = useRef(0)

  const handleCustomEvent = useCallback(
    (eventType: string, data: unknown, context: { toolCallId?: string }) => {
      if (eventType === 'product_codemode:llm_call') {
        const d = data as { count?: number; totalContextBytes?: number }
        if (typeof d?.count === 'number')
          setLlmCalls((p) => Math.max(p, d.count!))
        if (typeof d?.totalContextBytes === 'number')
          setContextBytes(d.totalContextBytes)
        return
      }
      if (eventType === 'product_codemode:chat_start') {
        setTimeMs(null)
        return
      }
      if (eventType === 'product_codemode:chat_end') {
        const d = data as { durationMs?: number }
        if (typeof d?.durationMs === 'number') setTimeMs(d.durationMs)
        return
      }

      const toolCallId = context.toolCallId
      if (!toolCallId) return

      const event: VMEvent = {
        id: `cm-event-${eventIdCounter.current++}`,
        eventType,
        data,
        timestamp: Date.now(),
      }

      setToolCallEvents((prev) => {
        const next = new Map(prev)
        const events = next.get(toolCallId) || []
        next.set(toolCallId, [...events, event])
        return next
      })
    },
    [],
  )

  const { messages, sendMessage, isLoading, stop } = useChat({
    id: 'product-codemode',
    connection: fetchServerSentEvents('/api/product-codemode'),
    body,
    onCustomEvent: handleCustomEvent,
  })

  useEffect(() => {
    onLoadingChange(isLoading)
  }, [isLoading, onLoadingChange])

  useEffect(() => {
    if (triggerCount === 0) return
    const prompt = promptRef.current
    if (!prompt) return

    setLlmCalls(0)
    setContextBytes(0)
    setTimeMs(null)
    setToolCallEvents(new Map())
    eventIdCounter.current = 0

    sendMessage(prompt)
  }, [triggerCount]) // eslint-disable-line react-hooks/exhaustive-deps

  const toolCalls = useMemo(() => {
    let count = 0
    for (const m of messages) {
      for (const p of m.parts) {
        if (p.type === 'tool-call') count++
      }
    }
    return count
  }, [messages])

  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="flex-1 flex flex-col border-r border-gray-700/50 min-w-0">
      <div className="px-4 py-2 bg-cyan-900/20 border-b border-cyan-500/20 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-cyan-400" />
        <span className="text-sm font-semibold text-cyan-300">Code Mode</span>
        {isLoading && (
          <button
            onClick={stop}
            className="ml-auto px-2 py-0.5 bg-red-600/80 hover:bg-red-600 text-white rounded text-[10px] font-medium transition-colors flex items-center gap-1"
          >
            <Square className="w-2.5 h-2.5 fill-current" />
            Stop
          </button>
        )}
      </div>
      <ScoreCard
        llmCalls={llmCalls}
        toolCalls={toolCalls}
        contextBytes={contextBytes}
        durationMs={timeMs}
      />
      {!messages.length ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
          Waiting for prompt...
        </div>
      ) : (
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto px-3 py-3"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(75, 85, 99, 0.5) transparent',
          }}
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
                className={`p-3 rounded-lg mb-2 ${
                  message.role === 'assistant'
                    ? 'bg-linear-to-r from-cyan-500/5 to-blue-600/5'
                    : 'bg-transparent'
                }`}
              >
                <div className="flex items-start gap-3">
                  {message.role === 'assistant' ? (
                    <div className="w-6 h-6 rounded bg-linear-to-r from-cyan-500 to-blue-600 flex items-center justify-center text-[10px] font-medium text-white shrink-0">
                      AI
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded bg-gray-700 flex items-center justify-center text-[10px] font-medium text-white shrink-0">
                      U
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-sm">
                    {message.parts.map((part, index) => {
                      if (part.type === 'text' && part.content) {
                        return (
                          <MessageMarkdown
                            key={`text-${index}`}
                            content={part.content}
                          />
                        )
                      }

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
                        const isInputStreaming =
                          part.state === 'input-streaming'
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
                          <div key={part.id} className="mt-2 space-y-2">
                            {!code && isStillGenerating ? (
                              <div className="rounded-lg border border-blue-700 bg-blue-900/30 overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-2">
                                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                  <span className="text-blue-300 text-xs font-medium">
                                    Generating code...
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
                                  parsedOutput?.error?.message ||
                                  toolResult?.error
                                }
                                logs={parsedOutput?.logs}
                              />
                            )}
                          </div>
                        )
                      }

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

                      if (part.type === 'tool-result') return null
                      return null
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- Regular Tools Panel (isolated useChat) ---

function RegularToolsPanel({
  body,
  promptRef,
  triggerCount,
  onLoadingChange,
}: {
  body: { provider: string; model: string }
  promptRef: React.RefObject<string>
  triggerCount: number
  onLoadingChange: (loading: boolean) => void
}) {
  const [llmCalls, setLlmCalls] = useState(0)
  const [contextBytes, setContextBytes] = useState(0)
  const [timeMs, setTimeMs] = useState<number | null>(null)

  const handleCustomEvent = useCallback(
    (eventType: string, data: unknown) => {
      if (eventType === 'product_regular:llm_call') {
        const d = data as { count?: number; totalContextBytes?: number }
        if (typeof d?.count === 'number')
          setLlmCalls((p) => Math.max(p, d.count!))
        if (typeof d?.totalContextBytes === 'number')
          setContextBytes(d.totalContextBytes)
        return
      }
      if (eventType === 'product_regular:chat_start') {
        setTimeMs(null)
        return
      }
      if (eventType === 'product_regular:chat_end') {
        const d = data as { durationMs?: number }
        if (typeof d?.durationMs === 'number') setTimeMs(d.durationMs)
      }
    },
    [],
  )

  const { messages, sendMessage, isLoading, stop } = useChat({
    id: 'product-regular',
    connection: fetchServerSentEvents('/api/product-regular'),
    body,
    onCustomEvent: handleCustomEvent,
  })

  useEffect(() => {
    onLoadingChange(isLoading)
  }, [isLoading, onLoadingChange])

  useEffect(() => {
    if (triggerCount === 0) return
    const prompt = promptRef.current
    if (!prompt) return

    setLlmCalls(0)
    setContextBytes(0)
    setTimeMs(null)

    sendMessage(prompt)
  }, [triggerCount]) // eslint-disable-line react-hooks/exhaustive-deps

  const toolCalls = useMemo(() => {
    let count = 0
    for (const m of messages) {
      for (const p of m.parts) {
        if (p.type === 'tool-call') count++
      }
    }
    return count
  }, [messages])

  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-4 py-2 bg-amber-900/20 border-b border-amber-500/20 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-amber-400" />
        <span className="text-sm font-semibold text-amber-300">
          Regular Tools
        </span>
        {isLoading && (
          <button
            onClick={stop}
            className="ml-auto px-2 py-0.5 bg-red-600/80 hover:bg-red-600 text-white rounded text-[10px] font-medium transition-colors flex items-center gap-1"
          >
            <Square className="w-2.5 h-2.5 fill-current" />
            Stop
          </button>
        )}
      </div>
      <ScoreCard
        llmCalls={llmCalls}
        toolCalls={toolCalls}
        contextBytes={contextBytes}
        durationMs={timeMs}
      />
      {!messages.length ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
          Waiting for prompt...
        </div>
      ) : (
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto px-3 py-3"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(75, 85, 99, 0.5) transparent',
          }}
        >
          {messages.map((message) => {
            const toolResults = new Map<
              string,
              { content: string; state: string; error?: string }
            >()
            for (const part of message.parts) {
              if (part.type === 'tool-result') {
                toolResults.set(part.toolCallId, {
                  content: part.content,
                  state: part.state,
                  error: part.error,
                })
              }
            }

            return (
              <div
                key={message.id}
                className={`p-3 rounded-lg mb-2 ${
                  message.role === 'assistant'
                    ? 'bg-linear-to-r from-amber-500/5 to-orange-600/5'
                    : 'bg-transparent'
                }`}
              >
                <div className="flex items-start gap-3">
                  {message.role === 'assistant' ? (
                    <div className="w-6 h-6 rounded bg-linear-to-r from-amber-500 to-orange-600 flex items-center justify-center text-[10px] font-medium text-white shrink-0">
                      AI
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded bg-gray-700 flex items-center justify-center text-[10px] font-medium text-white shrink-0">
                      U
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-sm">
                    {message.parts.map((part, index) => {
                      if (part.type === 'text' && part.content) {
                        return (
                          <MessageMarkdown
                            key={`text-${index}`}
                            content={part.content}
                          />
                        )
                      }

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

                      if (part.type === 'tool-result') return null
                      return null
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- Main Page ---

function ProductDemoPage() {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(
    MODEL_OPTIONS[0],
  )
  const [input, setInput] = useState('')
  const [cmLoading, setCmLoading] = useState(false)
  const [regLoading, setRegLoading] = useState(false)

  const promptRef = useRef('')
  const [triggerCount, setTriggerCount] = useState(0)

  const isLoading = cmLoading || regLoading

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
    }),
    [selectedModel.provider, selectedModel.model],
  )

  const handleSend = useCallback((text: string) => {
    promptRef.current = text
    setTriggerCount((c) => c + 1)
  }, [])

  const onCmLoadingChange = useCallback((v: boolean) => setCmLoading(v), [])
  const onRegLoadingChange = useCallback((v: boolean) => setRegLoading(v), [])

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Header */}
      <Header>
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
          className="rounded-lg border border-cyan-500/20 bg-gray-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50 disabled:opacity-50"
        >
          {MODEL_OPTIONS.map((option, index) => (
            <option key={index} value={index}>
              {option.label}
            </option>
          ))}
        </select>
      </Header>

      {/* Expository text */}
      <div className="px-6 py-4 border-b border-gray-700/50 bg-gray-800/30">
        <p className="text-sm text-gray-300 max-w-5xl mx-auto leading-relaxed">
          <strong className="text-white">N+1 API Problem:</strong> Many
          real-world APIs force clients through paginated listings and individual
          record fetches — a classic N+1 pattern. With regular tool-calling, the
          LLM must round-trip through each call sequentially, ballooning context
          and latency. Worse, when the LLM finally has to compute an answer from
          dozens of tool results stuffed into its context window, it often gets
          the math wrong.{' '}
          <strong className="text-cyan-400">Code Mode</strong> lets the LLM
          write its own efficient data-fetching code in a single execution,
          collapsing dozens of round trips into one — and because the runtime
          does the arithmetic, the answer is correct every time.
        </p>
      </div>

      {/* Canned prompts */}
      <div className="px-6 py-3 border-b border-gray-700/50 bg-gray-800/20 flex items-center gap-3 justify-center">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Sparkles className="w-3 h-3" />
          <span>Try:</span>
        </div>
        {PROMPT_SUGGESTIONS.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => {
              if (!isLoading) {
                setInput('')
                handleSend(suggestion.prompt)
              }
            }}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-cyan-500/20 hover:border-cyan-500/40 text-gray-300 hover:text-white rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {suggestion.label}
          </button>
        ))}
      </div>

      {/* Two panels */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <CodeModePanel
          body={body}
          promptRef={promptRef}
          triggerCount={triggerCount}
          onLoadingChange={onCmLoadingChange}
        />
        <RegularToolsPanel
          body={body}
          promptRef={promptRef}
          triggerCount={triggerCount}
          onLoadingChange={onRegLoadingChange}
        />
      </div>

      {/* Shared input */}
      <div className="border-t border-cyan-500/10 bg-gray-900/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about the shoe catalog..."
              className="w-full rounded-lg border border-cyan-500/20 bg-gray-800/50 pl-4 pr-12 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-transparent resize-none overflow-hidden shadow-lg"
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
                  handleSend(input)
                  setInput('')
                }
              }}
            />
            <button
              onClick={() => {
                if (input.trim()) {
                  handleSend(input)
                  setInput('')
                }
              }}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-cyan-500 hover:text-cyan-400 disabled:text-gray-500 transition-colors focus:outline-none"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
