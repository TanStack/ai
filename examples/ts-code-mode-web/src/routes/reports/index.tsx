'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Send, Square, ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import { parsePartialJSON } from '@tanstack/ai'

import {
  ReportRenderer,
  ReportHeader,
  ReportsList,
  EmptyReportState,
  applyUIEvent,
  createEmptyReportState,
  ReportRuntimeProvider,
} from '@/components/reports'
import { CodeBlock, ExecutionResult, JavaScriptVM, Header } from '@/components'
import type { VMEvent } from '@/components'
import type {
  ReportState,
  ReportCreatedEventData,
  ReportDeletedEventData,
  ReportUIEventData,
  UIUpdate,
} from '@/lib/reports/types'
import { applyUIUpdates } from '@/lib/reports/apply-event'

export const Route = createFileRoute('/reports/' as any)({
  component: ReportsPage,
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
  const isReportTool =
    name.includes('report') || name === 'new_report' || name === 'delete_report'
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
      className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-700 hover:scrollbar-thumb-gray-600"
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
                ? 'bg-gradient-to-r from-cyan-500/5 to-purple-500/5'
                : 'bg-transparent'
            }`}
          >
            <div className="flex items-start gap-4">
              {message.role === 'assistant' ? (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 flex items-center justify-center text-sm font-medium text-white shrink-0">
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
                    const isStillGenerating = isAwaitingInput || isInputStreaming
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

function ReportsPage() {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(
    MODEL_OPTIONS[0]
  )
  const [toolCallEvents, setToolCallEvents] = useState<
    Map<string, Array<VMEvent>>
  >(new Map())
  const eventIdCounter = useRef(0)

  // Reports state - manages multiple reports
  const [reports, setReports] = useState<Map<string, ReportState>>(new Map())
  const [activeReportId, setActiveReportId] = useState<string | null>(null)

  const activeReport = activeReportId ? reports.get(activeReportId) : null

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
    }),
    [selectedModel.provider, selectedModel.model]
  )

  // Handle custom events from the API
  const handleCustomEvent = useCallback(
    (eventType: string, data: unknown, context: { toolCallId?: string }) => {
      const toolCallId = context.toolCallId

      // Handle report:created events
      if (eventType === 'report:created') {
        const eventData = data as ReportCreatedEventData
        setReports((prev) => {
          const newMap = new Map(prev)
          newMap.set(
            eventData.report.id,
            createEmptyReportState(eventData.report)
          )
          return newMap
        })

        // Auto-select the new report
        if (eventData.autoSelect) {
          setActiveReportId(eventData.report.id)
        }
        return
      }

      // Handle report:deleted events
      if (eventType === 'report:deleted') {
        const eventData = data as ReportDeletedEventData
        setReports((prev) => {
          const newMap = new Map(prev)
          newMap.delete(eventData.reportId)
          return newMap
        })

        // If deleted report was active, clear selection
        if (activeReportId === eventData.reportId) {
          setActiveReportId(null)
        }
        return
      }

      // Handle report:ui events
      if (eventType === 'report:ui') {
        const eventData = data as ReportUIEventData
        setReports((prev) => {
          const newMap = new Map(prev)
          const reportState = newMap.get(eventData.reportId)

          if (reportState) {
            const updated = applyUIEvent(reportState, eventData.event)
            newMap.set(eventData.reportId, updated)
          }

          return newMap
        })
        return
      }

      // Handle VM events for tool calls
      if (toolCallId) {
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
      }
    },
    [activeReportId]
  )

  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: fetchServerSentEvents('/api/reports'),
    body,
    onCustomEvent: handleCustomEvent,
  })

  const [input, setInput] = useState('')

  // Handle suggestion click from empty state
  const handleSuggestionClick = useCallback(
    (prompt: string) => {
      if (!isLoading) {
        sendMessage(prompt)
      }
    },
    [isLoading, sendMessage]
  )

  // Delete a report
  const handleDeleteReport = useCallback(
    (reportId: string) => {
      setReports((prev) => {
        const newMap = new Map(prev)
        newMap.delete(reportId)
        return newMap
      })
      if (activeReportId === reportId) {
        setActiveReportId(null)
      }
    },
    [activeReportId]
  )

  const applyUpdates = useCallback(
    (updates: UIUpdate[]) => {
      if (!activeReportId) return
      setReports((prev) => {
        const reportState = prev.get(activeReportId)
        if (!reportState) return prev
        const nextState = applyUIUpdates(reportState, updates)
        const nextMap = new Map(prev)
        nextMap.set(activeReportId, nextState)
        return nextMap
      })
    },
    [activeReportId],
  )

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Header */}
      <Header>
        {/* Model Selector */}
        <select
          value={MODEL_OPTIONS.findIndex(
            (opt) =>
              opt.provider === selectedModel.provider &&
              opt.model === selectedModel.model
          )}
          onChange={(e) => {
            const option = MODEL_OPTIONS[parseInt(e.target.value)]
            setSelectedModel(option)
          }}
          disabled={isLoading}
          className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50 disabled:opacity-50"
        >
          {MODEL_OPTIONS.map((option, index) => (
            <option key={index} value={index}>
              {option.label}
            </option>
          ))}
        </select>
      </Header>

      <div className="flex flex-1 overflow-hidden">
        {/* Report Area - 2/3 width */}
        <div className="w-2/3 border-r border-gray-700 flex flex-col">
          {activeReport ? (
          <>
            <ReportHeader
              report={activeReport.report}
              onClose={() => setActiveReportId(null)}
            />
            <div
              className="flex-1 overflow-auto p-6"
              style={{
                ['--report-bg' as string]: 'rgb(17, 24, 39)',
                ['--report-card-bg' as string]: 'rgb(31, 41, 55)',
                ['--report-border' as string]: 'rgb(55, 65, 81)',
                ['--report-text' as string]: 'rgb(243, 244, 246)',
                ['--report-text-muted' as string]: 'rgb(156, 163, 175)',
                ['--report-accent' as string]: 'rgb(6, 182, 212)',
                ['--report-success' as string]: 'rgb(34, 197, 94)',
                ['--report-warning' as string]: 'rgb(245, 158, 11)',
                ['--report-error' as string]: 'rgb(239, 68, 68)',
              }}
            >
              {activeReport.nodes.size === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-cyan-500/20 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                    <p className="text-gray-400">Building report...</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Components will appear as they're added
                    </p>
                  </div>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto">
                  <ReportRuntimeProvider
                    reportId={activeReport.report.id}
                    applyUIUpdates={applyUpdates}
                  >
                    <ReportRenderer
                      nodes={activeReport.nodes}
                      rootIds={activeReport.rootIds}
                    />
                  </ReportRuntimeProvider>
                </div>
              )}
            </div>
          </>
        ) : (
          <EmptyReportState onSuggestionClick={handleSuggestionClick} />
        )}
      </div>

        {/* Sidebar - 1/3 width */}
        <div className="w-1/3 flex flex-col bg-gray-850">
          {/* Reports List */}
          <ReportsList
            reports={Array.from(reports.values())}
            activeReportId={activeReportId}
            onSelectReport={setActiveReportId}
            onDeleteReport={handleDeleteReport}
          />

          {/* Chat Messages */}
          <div className="flex-1 flex flex-col min-h-0 border-t border-gray-700">
            <div className="px-4 py-3 border-b border-gray-700/50 bg-gray-800/30">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Chat</span>
              </div>
            </div>

            {messages.length === 0 ? (
              <div className="flex-1 flex items-center justify-center px-4">
                <p className="text-sm text-gray-500 text-center">
                  Ask the AI to create a report or analyze data
                </p>
              </div>
            ) : (
              <Messages messages={messages} toolCallEvents={toolCallEvents} />
            )}

            {/* Input area */}
            <div className="border-t border-gray-700 bg-gray-900/80 p-4">
              {isLoading && (
                <div className="flex items-center justify-center mb-3">
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
                  placeholder="Create a report comparing..."
                  className="w-full rounded-lg border border-gray-600 bg-gray-800/50 pl-4 pr-12 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-transparent resize-none overflow-hidden"
                  rows={1}
                  style={{ minHeight: '44px', maxHeight: '120px' }}
                  disabled={isLoading}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height =
                      Math.min(target.scrollHeight, 120) + 'px'
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-cyan-500 hover:text-cyan-400 disabled:text-gray-500 transition-colors focus:outline-none"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
