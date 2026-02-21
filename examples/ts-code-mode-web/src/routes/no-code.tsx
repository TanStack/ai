import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronRight,
  Download,
  Send,
  Sparkles,
  Square,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import { Header, NoCodeMetrics } from '@/components'
import { exportConversationToPdfTool } from '@/lib/tools/export-pdf-tool'

export const Route = createFileRoute('/no-code')({
  component: NoCodePage,
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
    label: '🔥 Hottest React State Libraries',
    prompt: 'What are the hottest React state management libraries?',
  },
  {
    label: '📊 Compare Query Libraries',
    prompt:
      'Compare React Query vs SWR - which has more downloads and GitHub stars?',
  },
  {
    label: '📈 Zustand Trends',
    prompt: 'How many downloads did zustand get last month? Show me the trend.',
  },
  {
    label: '🏆 Top TypeScript Frameworks',
    prompt:
      'What are the most popular TypeScript web frameworks by GitHub stars?',
  },
  {
    label: '🔍 TanStack Query Stats',
    prompt: 'Get the GitHub stats and NPM downloads for @tanstack/query',
  },
]

type ToolCategory = 'github' | 'npm' | 'utility' | 'system'

interface ToolMeta {
  name: string
  description: string
  category: ToolCategory
}

const TOOL_METADATA: Array<ToolMeta> = [
  {
    name: 'getStarredRepos',
    description:
      'Fetch GitHub starred repositories for a user. Returns repos with star counts, languages, and activity dates.',
    category: 'github',
  },
  {
    name: 'getRepoDetails',
    description:
      'Get detailed information about a specific GitHub repository including stars, forks, issues, and license.',
    category: 'github',
  },
  {
    name: 'getRepoReleases',
    description:
      'Get releases for a repository including version tags, release notes, and publish dates.',
    category: 'github',
  },
  {
    name: 'getRepoContributors',
    description:
      'Get top contributors for a repository with their contribution counts.',
    category: 'github',
  },
  {
    name: 'searchRepositories',
    description:
      'Search GitHub repositories by query. Supports language filters, sorting by stars/forks/updated.',
    category: 'github',
  },
  {
    name: 'getNpmPackageInfo',
    description:
      'Get NPM package metadata including description, version history, maintainers, and keywords.',
    category: 'npm',
  },
  {
    name: 'createNPMComparison',
    description:
      'Create a comparison session and return the first comparison ID.',
    category: 'npm',
  },
  {
    name: 'addToNPMComparison',
    description:
      'Add a single package to a comparison and return a new comparison ID.',
    category: 'npm',
  },
  {
    name: 'executeNPMComparison',
    description: 'Execute a comparison using the final comparison ID.',
    category: 'npm',
  },
  {
    name: 'getCurrentDate',
    description:
      'Get the current date and time. Useful for calculating relative date ranges.',
    category: 'utility',
  },
  {
    name: 'calculateStats',
    description:
      'Calculate statistics (mean, median, min, max, stdDev, sum) for an array of numbers.',
    category: 'utility',
  },
  {
    name: 'formatDateRange',
    description:
      'Calculate a date range going back from today. Returns start and end dates formatted for API calls.',
    category: 'utility',
  },
  {
    name: 'export_conversation_to_pdf',
    description:
      'Export the current conversation to a PDF file. The PDF will be downloaded automatically.',
    category: 'system',
  },
]

const TOOL_CATEGORY_CONFIG: Record<
  ToolCategory,
  { label: string; dotColor: string }
> = {
  github: { label: 'GitHub', dotColor: 'bg-gray-500' },
  npm: { label: 'NPM', dotColor: 'bg-red-500' },
  utility: { label: 'Utility', dotColor: 'bg-blue-500' },
  system: { label: 'System', dotColor: 'bg-cyan-500' },
}

function ToolSidebar({ toolCounts }: { toolCounts: Map<string, number> }) {
  const toolsByCategory = useMemo(() => {
    return TOOL_METADATA.reduce(
      (acc, tool) => {
        if (!acc[tool.category]) {
          acc[tool.category] = []
        }
        acc[tool.category].push(tool)
        return acc
      },
      {} as Record<ToolCategory, Array<ToolMeta>>,
    )
  }, [])

  const totalCalls = Array.from(toolCounts.values()).reduce((a, b) => a + b, 0)

  return (
    <aside className="w-96 border-r border-cyan-500/20 bg-gray-800/50 overflow-y-auto">
      <div className="p-4 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-300">
            Available Tools
          </h2>
          {totalCalls > 0 && (
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">
              {totalCalls}
            </span>
          )}
        </div>

        {Object.entries(toolsByCategory).map(([category, tools]) => {
          const config = TOOL_CATEGORY_CONFIG[category as ToolCategory]
          return (
            <section key={category} className="space-y-2">
              <h3 className="text-xs font-medium text-gray-400 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                {config.label}
              </h3>
              <div className="space-y-2">
                {tools.map((tool) => {
                  const count = toolCounts.get(tool.name) || 0
                  return (
                    <div
                      key={tool.name}
                      className="rounded border border-gray-700 bg-gray-800/50 px-3 py-2"
                    >
                      <div className="flex items-center justify-between">
                        <code className="text-xs font-mono text-pink-400">
                          {tool.name}
                        </code>
                        {count > 0 && (
                          <span className="text-xs font-mono px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300 font-medium">
                            {count}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">
                        {tool.description}
                      </p>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </aside>
  )
}

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
    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-900/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-900/20 text-amber-300 text-sm">
        {isRunning ? (
          <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className="w-4 h-4 rounded-full bg-amber-500/50" />
        )}
        <span className="font-mono font-medium">{name}</span>
        {isRunning && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-600 animate-pulse">
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
        <div className="border-t border-amber-500/20">
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
              <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin ml-1" />
            )}
          </button>
          {outputOpen && (
            <div className="px-3 pb-3">
              {isExecuting ? (
                <div className="flex items-center gap-2 text-xs text-amber-300">
                  <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
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

function Messages({ messages }: { messages: Array<UIMessage> }) {
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
        <p>Ask a question about GitHub or NPM analytics...</p>
      </div>
    )
  }

  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-700 hover:scrollbar-thumb-gray-600"
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
            className={`p-4 rounded-lg mb-2 ${
              message.role === 'assistant'
                ? 'bg-linear-to-r from-cyan-500/5 to-blue-600/5'
                : 'bg-transparent'
            }`}
          >
            <div className="flex items-start gap-4">
              {message.role === 'assistant' ? (
                <div className="w-8 h-8 rounded-lg bg-linear-to-r from-cyan-500 to-blue-600 flex items-center justify-center text-sm font-medium text-white shrink-0">
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

function NoCodePage() {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(
    MODEL_OPTIONS[0],
  )
  const [isExporting, setIsExporting] = useState(false)
  const [isChatExpanded, setIsChatExpanded] = useState(false)

  const messagesRef = useRef<Array<UIMessage>>([])

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
    }),
    [selectedModel.provider, selectedModel.model],
  )

  const exportPdfClientTool = useMemo(
    () =>
      exportConversationToPdfTool.client(async (args) => {
        const currentMessages = messagesRef.current
        if (currentMessages.length === 0) {
          return {
            success: false,
            message: 'No messages to export',
          }
        }

        try {
          const response = await fetch('/api/generate-pdf', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: currentMessages,
              title: args.title,
            }),
          })

          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || 'Failed to generate PDF')
          }

          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          const contentDisposition = response.headers.get('Content-Disposition')
          const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
          const filename = filenameMatch?.[1] || 'conversation.pdf'
          a.download = filename
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          window.URL.revokeObjectURL(url)

          return {
            success: true,
            message: 'PDF exported successfully',
            filename,
          }
        } catch (error) {
          console.error('Failed to export PDF:', error)
          return {
            success: false,
            message:
              error instanceof Error ? error.message : 'Failed to export PDF',
          }
        }
      }),
    [],
  )

  const [llmCallCount, setLlmCallCount] = useState(0)
  const [totalTimeMs, setTotalTimeMs] = useState<number | null>(null)
  const [totalContextBytes, setTotalContextBytes] = useState(0)
  const [averageContextBytes, setAverageContextBytes] = useState(0)
  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: fetchServerSentEvents('/api/no-code'),
    body,
    tools: [exportPdfClientTool],
    onCustomEvent: useCallback(
      (eventType: string, data: unknown, _context: { toolCallId?: string }) => {
        if (eventType === 'no_code:llm_call') {
          let count: number | undefined
          let nextTotalContextBytes: number | undefined
          let nextAverageContextBytes: number | undefined
          if (data && typeof data === 'object' && 'count' in data) {
            const rawCount = (data as { count?: unknown }).count
            if (typeof rawCount === 'number') {
              count = rawCount
            }
          }
          if (data && typeof data === 'object' && 'totalContextBytes' in data) {
            const rawTotal = (data as { totalContextBytes?: unknown })
              .totalContextBytes
            if (typeof rawTotal === 'number') {
              nextTotalContextBytes = rawTotal
            }
          }
          if (
            data &&
            typeof data === 'object' &&
            'averageContextBytes' in data
          ) {
            const rawAverage = (data as { averageContextBytes?: unknown })
              .averageContextBytes
            if (typeof rawAverage === 'number') {
              nextAverageContextBytes = rawAverage
            }
          }
          setLlmCallCount((prev) => (count ? Math.max(prev, count) : prev + 1))
          if (typeof nextTotalContextBytes === 'number') {
            setTotalContextBytes(nextTotalContextBytes)
          }
          if (typeof nextAverageContextBytes === 'number') {
            setAverageContextBytes(nextAverageContextBytes)
          }
          return
        }

        if (eventType === 'no_code:chat_start') {
          setTotalTimeMs(null)
          return
        }

        if (eventType === 'no_code:chat_end') {
          if (data && typeof data === 'object' && 'durationMs' in data) {
            const rawDuration = (data as { durationMs?: unknown }).durationMs
            if (typeof rawDuration === 'number') {
              setTotalTimeMs(rawDuration)
            }
          }
        }
      },
      [],
    ),
  })

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const [input, setInput] = useState('')
  const chatWidthClass = isChatExpanded ? 'max-w-none' : 'max-w-4xl'

  const messageBytes = useMemo(
    () => new TextEncoder().encode(JSON.stringify(messages)).length,
    [messages],
  )

  const toolCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === 'tool-call') {
          counts.set(part.name, (counts.get(part.name) || 0) + 1)
        }
      }
    }
    return counts
  }, [messages])

  const exportConversationToPdf = async () => {
    if (messages.length === 0) return

    setIsExporting(true)
    try {
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate PDF')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const contentDisposition = response.headers.get('Content-Disposition')
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      a.download = filenameMatch?.[1] || 'conversation.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export PDF:', error)
      alert(error instanceof Error ? error.message : 'Failed to export PDF')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <Header>
        <NoCodeMetrics
          totalBytes={messageBytes}
          llmCalls={llmCallCount}
          totalContextBytes={totalContextBytes}
          averageContextBytes={averageContextBytes}
          totalTimeMs={totalTimeMs ?? undefined}
          model={selectedModel.model}
        />
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

        <button
          onClick={exportConversationToPdf}
          disabled={messages.length === 0 || isExporting || isLoading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-900/20 text-cyan-300 hover:bg-cyan-900/40 hover:border-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Export conversation to PDF"
        >
          {isExporting ? (
            <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">
            {isExporting ? 'Exporting...' : 'Export PDF'}
          </span>
        </button>
      </Header>

      <div className="flex flex-1 overflow-hidden">
        {!isChatExpanded && <ToolSidebar toolCounts={toolCounts} />}

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="border-b border-cyan-500/10 bg-gray-900/80 backdrop-blur-sm">
              <div className={`${chatWidthClass} mx-auto w-full px-4 py-2`}>
                <button
                  onClick={() => setIsChatExpanded((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-md border border-cyan-500/30 bg-gray-800/60 px-3 py-1.5 text-xs text-cyan-200 hover:bg-gray-800/90 hover:border-cyan-500/50 transition-colors"
                >
                  {isChatExpanded ? 'Show tools' : 'Full width chat'}
                </button>
              </div>
            </div>
            <div
              className={`flex-1 flex flex-col h-full ${chatWidthClass} mx-auto w-full overflow-hidden`}
            >
              <Messages messages={messages} />
            </div>
          </div>

          <div className="border-t border-cyan-500/10 bg-gray-900/80 backdrop-blur-sm">
            <div className={`${chatWidthClass} mx-auto px-4 py-3 space-y-3`}>
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
                  placeholder="Ask about GitHub repos, NPM packages, or analytics..."
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

              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Sparkles className="w-3 h-3" />
                  <span>Try:</span>
                </div>
                {PROMPT_SUGGESTIONS.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      if (!isLoading) {
                        sendMessage(suggestion.prompt)
                      }
                    }}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-cyan-500/20 hover:border-cyan-500/40 text-gray-300 hover:text-white rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
