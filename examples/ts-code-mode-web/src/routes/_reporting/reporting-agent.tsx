import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, Send, Sparkles, Square } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { motion, AnimatePresence } from 'framer-motion'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import { parsePartialJSON } from '@tanstack/ai'
import {
  CodeBlock,
  ExecutionResult,
  JavaScriptVM,
  Header,
  ContextSavings,
} from '@/components'
import type { VMEvent } from '@/components'

// Report components
import {
  ReportRenderer,
  ReportSelector,
  usePersistedReports,
} from '@/components/reports'
import type { Report, UIEvent } from '@/lib/reports/types'

export const Route = createFileRoute('/_reporting/reporting-agent')({
  component: ReportingAgentPage,
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
  { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
]

const PROMPT_SUGGESTIONS = [
  {
    label: '📊 Create Report',
    prompt:
      'Create a report comparing zustand, jotai, and redux-toolkit with download stats and trends.',
  },
  {
    label: '🔥 State Libraries',
    prompt:
      'What are the hottest React state management libraries? Create a report on them containing download stats and trends.',
  },
  {
    label: '📈 Package Trends',
    prompt: 'Create a report showing download trends for @tanstack/query.',
  },
]

// Generic tool call display component
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
  const prevStateRef = useRef(state)
  const prevOutputRef = useRef(output)

  useEffect(() => {
    const hadNoOutput = prevOutputRef.current === undefined
    const hasOutputNow = output !== undefined

    if (hadNoOutput && hasOutputNow) {
      if (!userControlledInput) setInputOpen(false)
      if (!userControlledOutput) setOutputOpen(false)
    }
    prevStateRef.current = state
    prevOutputRef.current = output
  }, [state, output, userControlledInput, userControlledOutput])

  let parsedArgs: unknown
  try {
    parsedArgs = JSON.parse(args)
  } catch {
    parsedArgs = args
  }

  // Determine colors based on tool name
  const isReportTool = name.includes('report')
  const borderColor = isReportTool
    ? 'border-cyan-500/30'
    : 'border-amber-500/30'
  const bgColor = isReportTool ? 'bg-cyan-900/10' : 'bg-amber-900/10'
  const headerBg = isReportTool ? 'bg-cyan-900/20' : 'bg-amber-900/20'
  const textColor = isReportTool ? 'text-cyan-300' : 'text-amber-300'
  const spinnerColor = isReportTool ? 'border-cyan-400' : 'border-amber-400'
  const pillColor = isReportTool ? 'bg-cyan-600' : 'bg-amber-600'
  const dotColor = isReportTool ? 'bg-cyan-500/50' : 'bg-amber-500/50'

  return (
    <div
      className={`mt-3 rounded-lg border ${borderColor} ${bgColor} overflow-hidden`}
    >
      <div
        className={`flex items-center gap-2 px-3 py-2 ${headerBg} ${textColor} text-sm`}
      >
        {isRunning ? (
          <div
            className={`w-4 h-4 border-2 ${spinnerColor} border-t-transparent rounded-full animate-spin`}
          />
        ) : (
          <div className={`w-4 h-4 rounded-full ${dotColor}`} />
        )}
        <span className="font-mono font-medium">{name}</span>
        {isRunning && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${pillColor} animate-pulse`}
          >
            Running...
          </span>
        )}
      </div>

      <div className={`border-t ${borderColor.replace('/30', '/20')}`}>
        <button
          onClick={() => {
            setUserControlledInput(true)
            setInputOpen(!inputOpen)
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:bg-white/5 transition-colors"
        >
          {inputOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>Input</span>
        </button>
        {inputOpen && (
          <pre className="px-3 pb-3 text-xs text-gray-300 overflow-x-auto max-h-48 overflow-y-auto">
            {typeof parsedArgs === 'string'
              ? parsedArgs
              : JSON.stringify(parsedArgs, null, 2)}
          </pre>
        )}
      </div>

      {(isExecuting || output !== undefined) && (
        <div className={`border-t ${borderColor.replace('/30', '/20')}`}>
          <button
            onClick={() => {
              setUserControlledOutput(true)
              setOutputOpen(!outputOpen)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:bg-white/5 transition-colors"
          >
            {outputOpen ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
            <span>Output</span>
            {isExecuting && (
              <div
                className={`w-3 h-3 border-2 ${spinnerColor} border-t-transparent rounded-full animate-spin ml-1`}
              />
            )}
          </button>
          {outputOpen && (
            <div className="px-3 pb-3">
              {isExecuting ? (
                <div className={`flex items-center gap-2 text-xs ${textColor}`}>
                  <div
                    className={`w-4 h-4 border-2 ${spinnerColor} border-t-transparent rounded-full animate-spin`}
                  />
                  <span>Executing...</span>
                </div>
              ) : (
                <pre className="text-xs text-gray-300 overflow-x-auto max-h-48 overflow-y-auto">
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

function Messages({
  messages,
  toolCallEvents,
}: {
  messages: Array<UIMessage>
  toolCallEvents: Map<string, Array<VMEvent>>
}) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight
    }
  }, [messages])

  if (!messages.length) {
    return null
  }

  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 min-h-0 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-700 hover:scrollbar-thumb-gray-600"
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
            className={`p-4 rounded-lg mb-2 ${
              message.role === 'assistant'
                ? 'bg-linear-to-r from-purple-500/5 to-cyan-500/5'
                : 'bg-transparent'
            }`}
          >
            <div className="flex items-start gap-4">
              {message.role === 'assistant' ? (
                <div className="w-8 h-8 rounded-lg bg-linear-to-r from-purple-500 to-cyan-500 flex items-center justify-center text-sm font-medium text-white shrink-0">
                  AI
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-sm font-medium text-white shrink-0">
                  U
                </div>
              )}
              <div className="flex-1 min-w-0">
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
                              <span className="text-blue-300 font-medium text-sm">
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
                              parsedOutput?.error?.message || toolResult?.error
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

                  if (part.type === 'tool-result') {
                    return null
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

// Empty state for chat when no messages
function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center text-gray-500 p-8">
      <div className="text-center max-w-md">
        <Sparkles size={48} className="mx-auto mb-4 text-purple-400/50" />
        <p className="text-xl font-medium mb-3 text-white">Dynamic Reports</p>
        <p className="text-sm text-gray-400">
          Ask the AI to create reports, compare packages, or analyze data.
        </p>
      </div>
    </div>
  )
}

// Calculate context sizes
function calculateActualSize(messages: Array<UIMessage>): number {
  return new TextEncoder().encode(JSON.stringify(messages)).length
}

function calculateTheoreticalSize(
  messages: Array<UIMessage>,
  toolCallEvents: Map<string, Array<VMEvent>>,
): number {
  let theoreticalSize = calculateActualSize(messages)

  for (const events of toolCallEvents.values()) {
    const externalCalls: Array<{ call: VMEvent; result?: VMEvent }> = []

    for (const event of events) {
      if (event.eventType === 'code_mode:external_call') {
        externalCalls.push({ call: event })
      } else if (event.eventType === 'code_mode:external_result') {
        const callData = event.data as { function?: string }
        const matchingCall = [...externalCalls]
          .reverse()
          .find(
            (c) =>
              !c.result &&
              (c.call.data as { function?: string })?.function ===
                callData?.function,
          )
        if (matchingCall) {
          matchingCall.result = event
        }
      }
    }

    for (const { call, result } of externalCalls) {
      const callData = call.data as {
        function?: string
        args?: unknown
      }
      const resultData = result?.data as { result?: unknown }

      const syntheticToolCall = {
        type: 'tool-call',
        id: `synthetic-${call.id}`,
        name: callData?.function || 'unknown',
        arguments: JSON.stringify(callData?.args || {}),
        state: 'input-complete',
        output: resultData?.result,
      }

      theoreticalSize += new TextEncoder().encode(
        JSON.stringify(syntheticToolCall),
      ).length
    }
  }

  return theoreticalSize
}

function ReportingAgentPage() {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(
    MODEL_OPTIONS[0],
  )
  const [toolCallEvents, setToolCallEvents] = useState<
    Map<string, Array<VMEvent>>
  >(new Map())
  const eventIdCounter = useRef(0)

  // Reports state (persisted)
  const {
    reports,
    activeReportId,
    activeReport,
    setActiveReportId,
    createReport,
    deleteReport,
    dispatchUIEvent,
    clearAll: clearAllReports,
    isHydrated,
  } = usePersistedReports()

  const hasActiveReport = activeReportId !== null

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
    }),
    [selectedModel.provider, selectedModel.model],
  )

  const handleCustomEvent = useCallback(
    (eventType: string, data: unknown, context: { toolCallId?: string }) => {
      const toolCallId = context.toolCallId

      // Handle report events
      if (eventType === 'report:created') {
        const { report, autoSelect } = data as {
          report: Report
          autoSelect: boolean
        }
        createReport(report, autoSelect)
        return
      }

      if (eventType === 'report:deleted') {
        const { reportId } = data as { reportId: string }
        deleteReport(reportId)
        return
      }

      if (eventType === 'report:ui') {
        const { reportId, event } = data as {
          reportId: string
          event: UIEvent
        }
        dispatchUIEvent(reportId, event)
        return
      }

      // Handle VM events
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
    [createReport, deleteReport, dispatchUIEvent],
  )

  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: fetchServerSentEvents('/api/reports'),
    body,
    onCustomEvent: handleCustomEvent,
  })

  const [input, setInput] = useState('')

  // Calculate context savings
  const contextData = useMemo(() => {
    if (messages.length === 0 || toolCallEvents.size === 0) return null
    const actual = calculateActualSize(messages)
    const theoretical = calculateTheoreticalSize(messages, toolCallEvents)
    return { actual, theoretical }
  }, [messages, toolCallEvents])

  // Don't render until hydrated to avoid flash
  if (!isHydrated) {
    return (
      <div className="flex h-screen bg-gray-900 items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Header */}
      <Header>
        {/* Context Savings - only when report exists and we have data */}
        {hasActiveReport && contextData && (
          <ContextSavings
            actual={contextData.actual}
            theoretical={contextData.theoretical}
            model={selectedModel.model}
          />
        )}

        {/* Model Selector */}
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
          className="rounded-lg border border-purple-500/20 bg-gray-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 disabled:opacity-50"
        >
          {MODEL_OPTIONS.map((option, index) => (
            <option key={index} value={index}>
              {option.label}
            </option>
          ))}
        </select>
      </Header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Panel */}
        <motion.div
          animate={{ width: hasActiveReport ? '50%' : '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="flex flex-col bg-gray-900 overflow-hidden"
        >
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 flex flex-col h-full max-w-4xl mx-auto w-full overflow-hidden">
              {messages.length === 0 ? (
                <EmptyState />
              ) : (
                <Messages messages={messages} toolCallEvents={toolCallEvents} />
              )}
            </div>
          </div>

          {/* Input area */}
          <div className="border-t border-gray-700/50 bg-gray-900/80 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
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
                  placeholder="Ask about packages or create a report..."
                  className="w-full rounded-lg border border-purple-500/20 bg-gray-800/50 pl-4 pr-12 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent resize-none overflow-hidden shadow-lg"
                  rows={1}
                  style={{ minHeight: '48px', maxHeight: '200px' }}
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-purple-500 hover:text-purple-400 disabled:text-gray-500 transition-colors focus:outline-none"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {/* Prompt suggestions - only show when no report is active */}
              {!hasActiveReport && (
                <div className="flex flex-wrap gap-2">
                  {PROMPT_SUGGESTIONS.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        if (!isLoading) {
                          sendMessage(suggestion.prompt)
                        }
                      }}
                      disabled={isLoading}
                      className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-purple-500/20 hover:border-purple-500/40 text-gray-300 hover:text-white rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Report Panel - slides in from right with light theme */}
        <AnimatePresence>
          {hasActiveReport && activeReport && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: '50%', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="flex flex-col bg-sky-50/70 border-l border-sky-200/50 overflow-hidden"
            >
              <ReportSelector
                reports={Array.from(reports.values()).map((r) => r.report)}
                activeReportId={activeReportId}
                onSelectReport={setActiveReportId}
                onCloseReport={() => setActiveReportId(null)}
                onClearAll={clearAllReports}
              />

              <div
                id={`report-${activeReport.report.id}`}
                className="flex-1 overflow-auto p-6"
              >
                <ReportRenderer
                  nodes={activeReport.nodes}
                  rootIds={activeReport.rootIds}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
