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
import { parsePartialJSON } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import type { VMEvent, IsolateVM } from '@/components'
import {
  CodeBlock,
  ExecutionResult,
  JavaScriptVM,
  ToolSidebar,
  Header,
  NoCodeMetrics,
} from '@/components'
import { NpmDataSidebar } from '@/components/NpmDataSidebar'
import { exportConversationToPdfTool } from '@/lib/tools/export-pdf-tool'

export const Route = createFileRoute('/_npm-github-chat/npm-github-chat')({
  component: CodeModePage,
})

type Provider = 'anthropic' | 'openai' | 'gemini' | 'zai'

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
  { provider: 'zai', model: 'glm-4.7', label: 'Z.AI GLM-4.7' },
  { provider: 'zai', model: 'glm-5-turbo', label: 'Z.AI GLM-5 Turbo' },
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
    prompt: 'Get me the GitHub stats and NPM downloads for @tanstack/query',
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
  // ToolCallState: 'awaiting-input' | 'input-streaming' | 'input-complete' | 'approval-requested' | 'approval-responded'
  const isInputStreaming = state === 'input-streaming'
  const isInputComplete = state === 'input-complete'
  // Consider complete if we have output OR a tool-result part exists
  const hasOutput = output !== undefined || hasResult
  const isExecuting = isInputComplete && !hasOutput
  const isRunning = isInputStreaming || isExecuting

  const [inputOpen, setInputOpen] = useState(isRunning)
  const [outputOpen, setOutputOpen] = useState(isRunning)
  const [userControlledInput, setUserControlledInput] = useState(false)
  const [userControlledOutput, setUserControlledOutput] = useState(false)
  const prevStateRef = useRef(state)
  const prevOutputRef = useRef(output)

  // Auto-collapse when execution completes (output becomes available)
  useEffect(() => {
    const hadNoOutput = prevOutputRef.current === undefined
    const hasOutput = output !== undefined

    if (hadNoOutput && hasOutput) {
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

  return (
    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-900/10 overflow-hidden">
      {/* Header */}
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

      {/* Input section */}
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

      {/* Output section - show when executing or has output */}
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
        // Build a map of tool results by toolCallId for quick lookup
        // This handles the case where results come as separate tool-result parts
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
                  // Text content
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

                  // Tool call - execute_typescript (special display)
                  if (
                    part.type === 'tool-call' &&
                    part.name === 'execute_typescript'
                  ) {
                    // Parse the code from arguments (supports partial JSON during streaming)
                    let code = ''
                    const parsedArgs = parsePartialJSON(part.arguments)
                    if (parsedArgs?.typescriptCode) {
                      code = parsedArgs.typescriptCode
                    }

                    // Check for tool result (either from part.output or from tool-result parts)
                    const toolResult = toolResults.get(part.id)
                    const hasOutput =
                      part.output !== undefined || toolResult !== undefined

                    // Parse the output - could be from part.output or from tool-result content
                    let parsedOutput = part.output
                    if (!parsedOutput && toolResult?.content) {
                      try {
                        parsedOutput = JSON.parse(toolResult.content)
                      } catch {
                        parsedOutput = { result: toolResult.content }
                      }
                    }

                    // Determine status based on tool call state
                    // ToolCallState: 'awaiting-input' | 'input-streaming' | 'input-complete' | 'approval-requested' | 'approval-responded'
                    const isAwaitingInput = part.state === 'awaiting-input'
                    const isInputStreaming = part.state === 'input-streaming'
                    const isInputComplete = part.state === 'input-complete'
                    const isStillGenerating =
                      isAwaitingInput || isInputStreaming
                    const isExecuting = isInputComplete && !hasOutput
                    const hasError =
                      parsedOutput?.success === false ||
                      toolResult?.error !== undefined

                    // Code block status: running while streaming input or executing
                    // Only show success/error when we have actual output
                    const codeStatus =
                      isStillGenerating || isExecuting
                        ? 'running'
                        : hasError
                          ? 'error'
                          : 'success'

                    // Execution result status
                    const executionStatus = isExecuting
                      ? 'running'
                      : hasError
                        ? 'error'
                        : 'success'

                    // Get events for this tool call
                    const events = toolCallEvents.get(part.id) || []

                    return (
                      <div key={part.id} className="mt-3 space-y-2">
                        {/* Show spinner while waiting for code, CodeBlock once we have code */}
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
                        {/* Show JavaScript VM when input is complete (executing or has output) */}
                        {isInputComplete &&
                          (events.length > 0 || isExecuting) && (
                            <JavaScriptVM
                              events={events}
                              isExecuting={isExecuting}
                            />
                          )}
                        {/* Show ExecutionResult when input is complete (executing or has output) */}
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

                  // Other tool calls - generic display
                  if (part.type === 'tool-call') {
                    // Check for tool result
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

                  // Skip tool-result parts (we handle them above via the map)
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

// Calculate context sizes for the chat metrics
function calculateActualSize(messages: Array<UIMessage>): number {
  return new TextEncoder().encode(JSON.stringify(messages)).length
}

function CodeModePage() {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(
    MODEL_OPTIONS[0],
  )
  const [selectedVM, setSelectedVM] = useState<IsolateVM>('node')
  const [chatLayout, setChatLayout] = useState<
    'tools-data' | 'full' | 'tools' | 'data'
  >('tools-data')
  // Track events per tool call
  const [toolCallEvents, setToolCallEvents] = useState<
    Map<string, Array<VMEvent>>
  >(new Map())
  // Track invocation counts for VM tools (external_* functions)
  const [toolInvocationCounts, setToolInvocationCounts] = useState<
    Map<string, number>
  >(new Map())
  const [llmCallCount, setLlmCallCount] = useState(0)
  const [totalContextBytes, setTotalContextBytes] = useState(0)
  const [averageContextBytes, setAverageContextBytes] = useState(0)
  const [totalTimeMs, setTotalTimeMs] = useState<number | null>(null)
  const eventIdCounter = useRef(0)
  const [isExporting, setIsExporting] = useState(false)
  // Track NPM data components
  const [npmDataComponents, setNpmDataComponents] = useState<
    Array<{
      id: string
      type: string
      data: any
      timestamp: number
    }>
  >([])
  const npmDataIdCounter = useRef(0)

  // Ref to hold current messages for the client tool to access
  const messagesRef = useRef<Array<UIMessage>>([])

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
      vm: selectedVM,
    }),
    [selectedModel.provider, selectedModel.model, selectedVM],
  )

  const handleCustomEvent = useCallback(
    (eventType: string, data: unknown, context: { toolCallId?: string }) => {
      const toolCallId = context.toolCallId

      // Handle npm:data events - store JSON data for sidebar display
      if (eventType === 'npm:data') {
        const npmData = data as {
          componentType: string
          toolName?: string
          data: any
        }
        setNpmDataComponents((prev) => [
          {
            id: `npm-${npmDataIdCounter.current++}`,
            type: npmData.componentType,
            data: npmData.data,
            timestamp: Date.now(),
          },
          ...prev,
        ])
        return
      }

      if (eventType === 'code_mode:llm_call') {
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
        if (data && typeof data === 'object' && 'averageContextBytes' in data) {
          const rawAverage = (data as { averageContextBytes?: unknown })
            .averageContextBytes
          if (typeof rawAverage === 'number') {
            nextAverageContextBytes = rawAverage
          }
        }
        setLlmCallCount((prev) =>
          typeof count === 'number' ? Math.max(prev, count) : prev + 1,
        )
        if (typeof nextTotalContextBytes === 'number') {
          setTotalContextBytes(nextTotalContextBytes)
        }
        if (typeof nextAverageContextBytes === 'number') {
          setAverageContextBytes(nextAverageContextBytes)
        }
        return
      }

      if (eventType === 'code_mode:chat_start') {
        setTotalTimeMs(null)
        return
      }

      if (eventType === 'code_mode:chat_end') {
        if (data && typeof data === 'object' && 'durationMs' in data) {
          const rawDuration = (data as { durationMs?: unknown }).durationMs
          if (typeof rawDuration === 'number') {
            setTotalTimeMs(rawDuration)
          }
        }
        return
      }

      if (!toolCallId) {
        // Events without toolCallId are ignored (shouldn't happen with code mode)
        return
      }

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

      // Track invocation counts for external_* calls
      if (eventType === 'code_mode:external_call') {
        const functionName = (data as { function?: string })?.function
        if (functionName) {
          setToolInvocationCounts((prev) => {
            const newMap = new Map(prev)
            newMap.set(functionName, (prev.get(functionName) || 0) + 1)
            return newMap
          })
        }
      }
    },
    [],
  )

  // Create the client tool with execute function that uses messagesRef
  const exportPdfClientTool = useMemo(
    () =>
      exportConversationToPdfTool.client(async (args) => {
        console.log('exportPdfClientTool', args)

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

          // Get the blob and trigger download
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          // Extract filename from Content-Disposition header or use default
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

  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: fetchServerSentEvents('/api/codemode'),
    body,
    onCustomEvent: handleCustomEvent,
    tools: [exportPdfClientTool],
  })

  // Keep messagesRef in sync with messages
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const [input, setInput] = useState('')
  const chatLayoutOptions = [
    { id: 'tools-data', label: 'Show tools & data' },
    { id: 'full', label: 'Full width chat' },
    { id: 'tools', label: 'Show tools' },
    { id: 'data', label: 'Show data' },
  ] as const
  const chatWidthClass = chatLayout === 'full' ? 'max-w-none' : 'max-w-4xl'
  const showTools = chatLayout === 'tools-data' || chatLayout === 'tools'
  const showData = chatLayout === 'tools-data' || chatLayout === 'data'
  const chatLayoutIndex = chatLayoutOptions.findIndex(
    (option) => option.id === chatLayout,
  )
  const nextChatLayoutIndex = (chatLayoutIndex + 1) % chatLayoutOptions.length
  const nextChatLayout = chatLayoutOptions[nextChatLayoutIndex]

  // Compute LLM tool call counts from messages
  const llmToolCounts = useMemo(() => {
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

  const messageBytes = useMemo(() => calculateActualSize(messages), [messages])

  // Manual export function for the UI button
  const exportConversationToPdf = useCallback(async () => {
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

      // Get the blob and trigger download
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // Extract filename from Content-Disposition header or use default
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
  }, [messages])

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Header */}
      <Header>
        <NoCodeMetrics
          totalBytes={messageBytes}
          llmCalls={llmCallCount}
          totalContextBytes={totalContextBytes}
          averageContextBytes={averageContextBytes}
          totalTimeMs={totalTimeMs ?? undefined}
          model={selectedModel.model}
        />

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
          className="rounded-lg border border-cyan-500/20 bg-gray-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50 disabled:opacity-50"
        >
          {MODEL_OPTIONS.map((option, index) => (
            <option key={index} value={index}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Export PDF Button */}
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
        {/* Left Sidebar */}
        {showTools && (
          <ToolSidebar
            selectedVM={selectedVM}
            onVMChange={setSelectedVM}
            toolInvocationCounts={toolInvocationCounts}
            llmToolCounts={llmToolCounts}
            llmCallCount={llmCallCount}
            totalContextBytes={totalContextBytes}
            averageContextBytes={averageContextBytes}
          />
        )}

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="border-b border-cyan-500/10 bg-gray-900/80 backdrop-blur-sm">
              <div className={`${chatWidthClass} mx-auto w-full px-4 py-2`}>
                <button
                  onClick={() => setChatLayout(nextChatLayout.id)}
                  className="inline-flex items-center gap-2 rounded-md border border-cyan-500/30 bg-gray-800/60 px-3 py-1.5 text-xs text-cyan-200 hover:bg-gray-800/90 hover:border-cyan-500/50 transition-colors"
                >
                  {nextChatLayout.label}
                </button>
              </div>
            </div>
            <div
              className={`flex-1 flex flex-col h-full ${chatWidthClass} mx-auto w-full overflow-hidden`}
            >
              <Messages messages={messages} toolCallEvents={toolCallEvents} />
            </div>
          </div>

          {/* Input area */}
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

              {/* Prompt suggestions */}
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

        {/* Right Sidebar - NPM Data */}
        {showData && <NpmDataSidebar components={npmDataComponents} />}
      </div>
    </div>
  )
}
