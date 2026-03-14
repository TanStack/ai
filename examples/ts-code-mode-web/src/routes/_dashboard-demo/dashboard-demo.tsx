'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ChatInput from '@/components/ChatInput'
import { Header } from '@/components'

export const Route = createFileRoute('/_dashboard-demo/dashboard-demo' as any)({
  component: DashboardDemoPage,
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

// ─── Agent Activity Types ──────────────────────────────────────────────────

interface AgentActivityEvent {
  id: string
  type: string
  tileId?: string
  tileName?: string
  agentName: string
  message: string
  data?: unknown
  timestamp: number
}

// Color mapping for tiles
const TILE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  revenue_by_region: {
    bg: 'bg-emerald-900/20',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
  },
  product_performance: {
    bg: 'bg-amber-900/20',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
  },
  customer_overview: {
    bg: 'bg-sky-900/20',
    text: 'text-sky-300',
    border: 'border-sky-500/30',
  },
  support_health: {
    bg: 'bg-rose-900/20',
    text: 'text-rose-300',
    border: 'border-rose-500/30',
  },
}

const ORCHESTRATOR_COLORS = {
  bg: 'bg-violet-900/20',
  text: 'text-violet-300',
  border: 'border-violet-500/30',
}

// ─── Agent Activity Panel ──────────────────────────────────────────────────

function AgentActivityPanel({ events }: { events: AgentActivityEvent[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [events])

  if (events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="text-sm">Agent activity will appear here</p>
          <p className="text-xs mt-1 text-gray-600">
            Ask a question to see the orchestrator and tile agents in action
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5"
    >
      {events.map((event) => {
        const colors = event.tileId
          ? TILE_COLORS[event.tileId] || ORCHESTRATOR_COLORS
          : ORCHESTRATOR_COLORS

        const isMemoryUpdate = event.type.includes('memory')
        const isComplete = event.type.includes('complete')

        return (
          <EventEntry
            key={event.id}
            event={event}
            colors={colors}
            isMemoryUpdate={isMemoryUpdate}
            isComplete={isComplete}
          />
        )
      })}
    </div>
  )
}

function EventEntry({
  event,
  colors,
  isMemoryUpdate,
  isComplete,
}: {
  event: AgentActivityEvent
  colors: { bg: string; text: string; border: string }
  isMemoryUpdate: boolean
  isComplete: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const hasData = event.data !== undefined

  const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <div
      className={`rounded-md border ${colors.border} ${colors.bg} px-2.5 py-1.5 text-xs`}
    >
      <div className="flex items-center gap-2">
        <span className="text-gray-500 font-mono text-[10px] shrink-0">
          {time}
        </span>
        {event.tileName ? (
          <span
            className={`${colors.text} font-medium text-[10px] px-1.5 py-0.5 rounded-full ${colors.bg} border ${colors.border} shrink-0`}
          >
            {event.tileName}
          </span>
        ) : (
          <span className="text-violet-300 font-medium text-[10px] px-1.5 py-0.5 rounded-full bg-violet-900/20 border border-violet-500/30 shrink-0">
            Orchestrator
          </span>
        )}
        <span
          className={`${isMemoryUpdate ? 'text-yellow-300' : isComplete ? 'text-green-300' : 'text-gray-300'} flex-1 truncate`}
        >
          {isMemoryUpdate ? '💾 ' : ''}
          {event.message}
        </span>
        {hasData && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-500 hover:text-gray-300 shrink-0"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        )}
      </div>
      {expanded && hasData && (
        <pre className="mt-1.5 text-[10px] text-gray-400 overflow-x-auto max-h-24 overflow-y-auto font-mono whitespace-pre-wrap border-t border-gray-700/50 pt-1.5">
          {JSON.stringify(event.data, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ─── Tool Call Display ─────────────────────────────────────────────────────

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

  const [inputOpen, setInputOpen] = useState(false)

  let parsedArgs: unknown
  try {
    parsedArgs = JSON.parse(args)
  } catch {
    parsedArgs = args
  }

  const isTileQuery = name === 'query_tile'
  const tileId =
    isTileQuery && typeof parsedArgs === 'object' && parsedArgs !== null
      ? (parsedArgs as { tileId?: string }).tileId
      : undefined
  const tileColors = tileId
    ? TILE_COLORS[tileId] || ORCHESTRATOR_COLORS
    : { bg: 'bg-violet-900/10', text: 'text-violet-300', border: 'border-violet-500/30' }

  return (
    <div
      className={`mt-2 rounded-lg border ${tileColors.border} ${tileColors.bg} overflow-hidden text-sm`}
    >
      <div
        className={`flex items-center gap-2 px-3 py-1.5 ${tileColors.text}`}
      >
        {isRunning ? (
          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className="w-3 h-3 rounded-full bg-current opacity-50" />
        )}
        <span className="font-mono font-medium text-xs">
          {isTileQuery && tileId ? `query: ${tileId}` : name}
        </span>
        {isRunning && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-current/20 animate-pulse">
            Running...
          </span>
        )}
      </div>

      {typeof parsedArgs === 'object' && parsedArgs !== null && (
        <div className={`border-t ${tileColors.border.replace('/30', '/20')}`}>
          <button
            onClick={() => setInputOpen(!inputOpen)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5 transition-colors"
          >
            {inputOpen ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            <span>
              {isTileQuery
                ? (parsedArgs as { question?: string }).question?.slice(0, 80) || 'Details'
                : 'Input'}
            </span>
          </button>
          {inputOpen && (
            <pre className="px-3 pb-2 text-xs text-gray-300 overflow-x-auto max-h-32 overflow-y-auto font-mono whitespace-pre-wrap">
              {JSON.stringify(parsedArgs, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Messages ──────────────────────────────────────────────────────────────

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
                ? 'bg-violet-900/30 text-violet-100 ml-6'
                : 'bg-gray-800/60 text-gray-100 mr-6'
            }`}
          >
            <div className="flex items-start gap-2">
              <div
                className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-medium shrink-0 ${
                  message.role === 'assistant'
                    ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white'
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

// ─── Main Page ─────────────────────────────────────────────────────────────

function DashboardDemoPage() {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(
    MODEL_OPTIONS[0],
  )
  const [activityEvents, setActivityEvents] = useState<AgentActivityEvent[]>([])

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
    }),
    [selectedModel.provider, selectedModel.model],
  )

  const handleCustomEvent = useCallback(
    (eventType: string, data: unknown) => {
      if (eventType.startsWith('dashboard:')) {
        const eventData = data as {
          type: string
          agentName: string
          message: string
          data?: unknown
          timestamp: number
          tileId?: string
          tileName?: string
        }
        const event: AgentActivityEvent = {
          id: `${eventData.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
          type: eventData.type,
          tileId: eventData.tileId,
          tileName: eventData.tileName,
          agentName: eventData.agentName,
          message: eventData.message,
          data: eventData.data,
          timestamp: eventData.timestamp,
        }
        setActivityEvents((prev) => [...prev, event])
      }
    },
    [],
  )

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/dashboard-chat'),
    body,
    onCustomEvent: handleCustomEvent,
  })

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — Chat (1/3 width) */}
        <div className="w-1/3 flex flex-col border-r border-gray-800">
          <div className="p-4 border-b border-gray-800 bg-gray-850">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-white">
                  Dashboard Chat
                </div>
                <div className="text-xs text-gray-400">
                  Orchestrator + Tile Agents
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
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-violet-500/50 disabled:opacity-50"
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
                'How are sales looking?',
                'What about APAC this year?',
                'Which products are performing best?',
                'Customer support health?',
                'Compare enterprise vs starter customers',
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
                Ask about your e-commerce data — revenue, products, customers,
                or support
              </p>
            </div>
          ) : (
            <Messages messages={messages} />
          )}

          <ChatInput
            onSend={(content) => sendMessage(content)}
            disabled={isLoading}
            placeholder="Ask about your dashboard..."
            exampleQueries={
              '"How are sales looking?" | "APAC revenue trends" | "Support ticket backlog"'
            }
          />
        </div>

        {/* Right panel — Agent Activity (2/3 width) */}
        <div className="w-2/3 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-800 bg-gray-850">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">
                  Agent Activity
                </div>
                <div className="text-xs text-gray-400">
                  Real-time pipeline events from orchestrator and tile agents
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-violet-400"></span>
                  <span className="text-gray-400">Orchestrator</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="text-gray-400">Revenue</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span className="text-gray-400">Products</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                  <span className="text-gray-400">Customers</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                  <span className="text-gray-400">Support</span>
                </span>
              </div>
            </div>
          </div>

          <AgentActivityPanel events={activityEvents} />

          {activityEvents.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-500 flex items-center justify-between">
              <span>{activityEvents.length} events</span>
              <button
                onClick={() => setActivityEvents([])}
                className="text-gray-500 hover:text-gray-300"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
