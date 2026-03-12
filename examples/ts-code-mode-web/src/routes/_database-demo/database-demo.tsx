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
  'Who are the top 3 customers by total spending?',
  'What is the most popular product by quantity sold?',
  'Show me all purchases from customers in New York',
  'What is the average order value by product category?',
  'Which customers have bought electronics products?',
  'Show monthly purchase totals over time',
]

function DatabaseDemoPage() {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(
    MODEL_OPTIONS[0],
  )
  const [useCodeMode, setUseCodeMode] = useState(true)

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
      useCodeMode,
    }),
    [selectedModel.provider, selectedModel.model, useCodeMode],
  )

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/database-demo'),
    body,
  })

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
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={useCodeMode}
                onChange={(e) => setUseCodeMode(e.target.checked)}
                disabled={isLoading}
                className="rounded border-gray-600 bg-gray-800 text-emerald-500 focus:ring-emerald-500/50"
              />
              Code Mode
            </label>
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
            <Messages messages={messages} />
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
      </div>
    </div>
  )
}
