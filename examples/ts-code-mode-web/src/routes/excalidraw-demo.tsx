'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ReportHeader,
  ReportRenderer,
  ReportRuntimeProvider,
} from '@/components/reports'
import {
  refreshResultsToUIUpdates,
  useReportSSE,
} from '@/components/reports/useReportSSE'
import ChatInput from '@/components/ChatInput'
import { Header } from '@/components'
import { applyUIEvent, applyUIUpdates } from '@/lib/reports/apply-event'
import type {
  RefreshResult,
  ReportState,
  ReportUIEventData,
  UIEffect,
  UIUpdate,
} from '@/lib/reports/types'

export const Route = createFileRoute('/excalidraw-demo' as any)({
  component: ExcalidrawDemoPage,
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
    model: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
  },
  { provider: 'openai', model: 'gpt-4o', label: 'GPT-4o' },
  { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
]

// Tool call display component for chat transcript
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

  const isReportTool =
    name.includes('report') ||
    name === 'new_report' ||
    name === 'delete_report' ||
    name.includes('excalidraw')
  const borderColor = isReportTool ? 'border-cyan-500/30' : 'border-amber-500/30'
  const bgColor = isReportTool ? 'bg-cyan-900/10' : 'bg-amber-900/10'
  const headerBg = isReportTool ? 'bg-cyan-900/20' : 'bg-amber-900/20'
  const textColor = isReportTool ? 'text-cyan-300' : 'text-amber-300'
  const spinnerColor = isReportTool ? 'border-cyan-400' : 'border-amber-400'
  const pillColor = isReportTool ? 'bg-cyan-600' : 'bg-amber-600'
  const dotColor = isReportTool ? 'bg-cyan-500/50' : 'bg-amber-500/50'

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

      {code && (
        <div className={`border-t ${borderColor.replace('/30', '/20')}`}>
          <button
            onClick={() => setInputOpen(!inputOpen)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5 transition-colors"
          >
            {inputOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>Code</span>
          </button>
          {inputOpen && (
            <pre className="px-3 pb-2 text-xs text-gray-300 overflow-x-auto max-h-32 overflow-y-auto font-mono whitespace-pre-wrap">
              {code}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// Messages component for chat transcript
function Messages({ messages }: { messages: Array<UIMessage> }) {
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
      className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
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
            className={`rounded-lg p-3 ${
              message.role === 'user'
                ? 'bg-cyan-900/30 text-cyan-100 ml-6'
                : 'bg-gray-800/60 text-gray-100 mr-6'
            }`}
          >
            <div className="flex items-start gap-2">
              <div
                className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-medium shrink-0 ${
                  message.role === 'assistant'
                    ? 'bg-linear-to-r from-cyan-500 to-purple-500 text-white'
                    : 'bg-gray-700 text-white'
                }`}
              >
                {message.role === 'assistant' ? 'AI' : 'U'}
              </div>
              <div className="flex-1 min-w-0 text-sm">
                {message.parts.map((part, index) => {
                  if (part.type === 'text' && part.content) {
                    return (
                      <div
                        key={`text-${index}`}
                        className="prose prose-invert prose-sm max-w-none"
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {part.content}
                        </ReactMarkdown>
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

interface ToastItem {
  id: string
  message: string
  variant: 'default' | 'success' | 'error'
}

const REPORT_ID = 'excalidraw-demo'

function ExcalidrawDemoPage() {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(
    MODEL_OPTIONS[0],
  )
  const [reportState, setReportState] = useState<ReportState | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  // Initialize diagram on mount
  useEffect(() => {
    async function initDiagram() {
      try {
        const response = await fetch('/api/excalidraw-init', { method: 'POST' })
        const data = await response.json()
        if (data.success) {
          const nodes = new Map(Object.entries(data.nodes))
          setReportState({
            report: data.report,
            nodes: nodes as Map<string, any>,
            rootIds: data.rootIds,
          })
        }
      } catch (error) {
        console.error('Failed to initialize diagram:', error)
      } finally {
        setIsInitializing(false)
      }
    }
    initDiagram()
  }, [])

  // Toast helper
  const pushToast = useCallback(
    (message: string, variant: 'default' | 'success' | 'error' = 'default') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setToasts((prev) => [...prev, { id, message, variant }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 4000)
    },
    [],
  )

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
    }),
    [selectedModel.provider, selectedModel.model],
  )

  const handleCustomEvent = useCallback(
    async (
      eventType: string,
      data: unknown,
      _context: { toolCallId?: string },
    ) => {
      // Handle report:ui events
      if (eventType === 'report:ui') {
        const eventData = data as ReportUIEventData
        if (eventData.reportId === REPORT_ID) {
          setReportState((prev) => {
            if (!prev) return prev
            return applyUIEvent(prev, eventData.event)
          })
        }
      }

      // Handle excalidraw:invalidated events - update the canvas elements
      if (eventType === 'excalidraw:invalidated') {
        const eventData = data as {
          reportId: string
          canvasId: string
          signals: string[]
          elements: unknown[]
        }
        if (eventData.reportId === REPORT_ID && eventData.canvasId === 'diagram') {
          // Update the excalidraw component's elements prop
          setReportState((prev) => {
            if (!prev) return prev
            const node = prev.nodes.get('diagram')
            if (node && node.type === 'excalidraw') {
              const updatedNode = {
                ...node,
                props: {
                  ...node.props,
                  elements: eventData.elements,
                },
              }
              const newNodes = new Map(prev.nodes)
              newNodes.set('diagram', updatedNode)
              return {
                ...prev,
                nodes: newNodes,
              }
            }
            return prev
          })
        }
      }
    },
    [],
  )

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/excalidraw-demo'),
    body,
    onCustomEvent: handleCustomEvent,
  })

  const applyUpdates = useCallback((updates: UIUpdate[]) => {
    setReportState((prev) => {
      if (!prev) return prev
      return applyUIUpdates(prev, updates)
    })
  }, [])

  // Handle refresh results from SSE
  const handleSSERefresh = useCallback(
    (results: RefreshResult[]) => {
      const updates = refreshResultsToUIUpdates(results)
      if (updates.length > 0) {
        applyUpdates(updates)
      }
    },
    [applyUpdates],
  )

  // Handle effects from SSE
  const handleSSEEffects = useCallback(
    (effects: UIEffect[]) => {
      for (const effect of effects) {
        if (effect.type === 'toast') {
          const params = effect.params as {
            message?: string
            variant?: 'default' | 'success' | 'error'
          }
          pushToast(params.message || 'Notification', params.variant || 'default')
        }
      }
    },
    [pushToast],
  )

  // Connect to SSE for external updates
  useReportSSE({
    reportId: REPORT_ID,
    onRefresh: handleSSERefresh,
    onEffects: handleSSEEffects,
    enabled: !isInitializing,
  })

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Chat */}
        <div className="w-96 flex flex-col border-r border-gray-800">
          <div className="p-4 border-b border-gray-800 bg-gray-850">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-white">
                  Diagram Builder
                </div>
                <div className="text-xs text-gray-400">
                  Create diagrams with AI + NPM/GitHub data
                </div>
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
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50 disabled:opacity-50"
              >
                {MODEL_OPTIONS.map((option, index) => (
                  <option key={index} value={index}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-b border-gray-800 p-4">
            <div className="text-sm font-semibold text-white mb-2">
              Try These Prompts
            </div>
            <div className="flex flex-col gap-2">
              {[
                'Draw a basic web app architecture with frontend, API, and database',
                'Show the architecture of a React app with state management',
                'Compare React Query vs SWR and diagram their architecture',
                'Add a caching layer between the API and database',
                'Add a button to insert a new microservice',
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  disabled={isLoading}
                  className="text-left text-sm p-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 text-gray-200 disabled:opacity-60"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center px-4">
              <p className="text-sm text-gray-500 text-center">
                Describe a diagram and I'll create it. You can also ask about
                NPM packages or GitHub repos!
              </p>
            </div>
          ) : (
            <Messages messages={messages} />
          )}

          <ChatInput
            onSend={(content) => sendMessage(content)}
            disabled={isLoading || isInitializing}
            placeholder="Describe a diagram or ask about NPM/GitHub..."
            exampleQueries={'"Web app architecture" | "Compare zustand vs jotai" | "Add a database"'}
          />
        </div>

        {/* Center - Diagram Canvas */}
        <div className="flex-1 flex flex-col">
          {reportState ? (
            <>
              <ReportHeader report={reportState.report} />
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
                {reportState.nodes.size === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    Creating canvas...
                  </div>
                ) : (
                  <div className="h-full">
                    <ReportRuntimeProvider
                      reportId={REPORT_ID}
                      applyUIUpdates={applyUpdates}
                    >
                      <ReportRenderer
                        nodes={reportState.nodes}
                        rootIds={reportState.rootIds}
                      />
                    </ReportRuntimeProvider>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              {isInitializing ? 'Loading diagram...' : 'Failed to load diagram'}
            </div>
          )}
        </div>
      </div>

      {/* Global toasts */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-lg px-4 py-2 text-sm shadow-lg border animate-in slide-in-from-top-2 ${
                toast.variant === 'success'
                  ? 'bg-emerald-600/90 text-white border-emerald-400/50'
                  : toast.variant === 'error'
                    ? 'bg-red-600/90 text-white border-red-400/50'
                    : 'bg-gray-900/90 text-white border-gray-600/60'
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
