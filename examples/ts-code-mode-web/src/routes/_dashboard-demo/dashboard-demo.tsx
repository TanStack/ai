'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ChatInput from '@/components/ChatInput'
import { Header } from '@/components'
import { INITIAL_MANIFEST } from '@/lib/dashboard/manifest'
import {
  DashboardPanel,
  dashboardReducer,
  createInitialState,
  TILE_COLORS,
  ORCHESTRATOR_COLORS,
} from '@/components/dashboard'
import type { AgentActivityEvent } from '@/components/dashboard'

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
  const [dashboardState, dispatch] = useReducer(
    dashboardReducer,
    INITIAL_MANIFEST,
    createInitialState,
  )

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
    }),
    [selectedModel.provider, selectedModel.model],
  )

  const handleCustomEvent = useCallback(
    (eventType: string, data: unknown) => {
      if (!eventType.startsWith('dashboard:')) return

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

      const tileId = eventData.tileId

      if (eventData.type === 'agent:start' && tileId) {
        dispatch({ type: 'TILE_LOADING', tileId, event })
      } else if (eventData.type === 'memory:update' && tileId) {
        dispatch({ type: 'TILE_MEMORY_UPDATE', tileId, event })
      } else if (eventData.type === 'session:updated' && tileId) {
        const sessionData = eventData.data as { memory: Record<string, unknown>; name: string; createdAt: number; lastUsedAt: number } | undefined
        if (sessionData) {
          dispatch({
            type: 'TILE_SESSION_UPDATED',
            tileId,
            session: {
              name: sessionData.name,
              memory: sessionData.memory,
              createdAt: sessionData.createdAt,
              lastUsedAt: sessionData.lastUsedAt,
            },
            event,
          })
        } else {
          dispatch({ type: 'ADD_EVENT', event, tileId })
        }
      } else if (eventData.type === 'agent:complete' && tileId) {
        dispatch({ type: 'TILE_COMPLETE', tileId, data: eventData.data, event })
      } else {
        dispatch({ type: 'ADD_EVENT', event, tileId })
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
        {/* Left panel — Chat (fixed width sidebar) */}
        <div className="w-80 shrink-0 flex flex-col border-r border-gray-800">
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

        {/* Right panel — Dashboard tiles + Activity drawer */}
        <DashboardPanel
          state={dashboardState}
          onClearEvents={() => dispatch({ type: 'CLEAR_EVENTS' })}
        />
      </div>
    </div>
  )
}
