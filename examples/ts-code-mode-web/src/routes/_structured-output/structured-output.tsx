import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronRight,
  Send,
  Sparkles,
  Square,
  Code,
  Eye,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import { parsePartialJSON } from '@tanstack/ai'
import {
  CodeBlock,
  ExecutionResult,
  JavaScriptVM,
  MessageSizeOverlay,
  Header,
} from '@/components'
import type { VMEvent } from '@/components'
import {
  BlogPostRenderer,
  SciFiStoryRenderer,
  GameShowRenderer,
  CountrySongRenderer,
  TriviaRenderer,
} from '@/components/structured-output'
import {
  OUTPUT_FORMAT_OPTIONS,
  type OutputFormat,
  type BlogPost,
  type SciFiStory,
  type GameShowPitch,
  type CountrySong,
  type TriviaSet,
} from '@/lib/structured-output-types'

export const Route = createFileRoute('/_structured-output/structured-output')({
  component: StructuredOutputPage,
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
    label: '📊 Vue vs Svelte Ecosystem',
    prompt: 'Compare the health of Vue vs Svelte ecosystems',
  },
  {
    label: '📈 Testing Frameworks',
    prompt: 'Which testing frameworks are growing fastest?',
  },
  {
    label: '🏆 Bun vs Node vs Deno',
    prompt: 'Analyze the rise of Bun vs Node vs Deno',
  },
  {
    label: '🔍 Build Tools 2025',
    prompt: 'What build tools should I consider in 2025?',
  },
]

// Type for structured output result
type StructuredResult = {
  format: OutputFormat
  data: BlogPost | SciFiStory | GameShowPitch | CountrySong | TriviaSet
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

// Structured Output Renderer Component
function StructuredOutputRenderer({
  result,
  showJson,
}: {
  result: StructuredResult
  showJson: boolean
}) {
  if (showJson) {
    return (
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-700 overflow-auto max-h-[600px]">
        <pre className="text-sm text-slate-300 font-mono">
          {JSON.stringify(result.data, null, 2)}
        </pre>
      </div>
    )
  }

  switch (result.format) {
    case 'blog':
      return <BlogPostRenderer data={result.data as BlogPost} />
    case 'scifi':
      return <SciFiStoryRenderer data={result.data as SciFiStory} />
    case 'gameshow':
      return <GameShowRenderer data={result.data as GameShowPitch} />
    case 'country':
      return <CountrySongRenderer data={result.data as CountrySong} />
    case 'trivia':
      return <TriviaRenderer data={result.data as TriviaSet} />
    default:
      return null
  }
}

function Messages({
  messages,
  toolCallEvents,
  structuredResult,
  showJson,
  isGeneratingStructured,
}: {
  messages: Array<UIMessage>
  toolCallEvents: Map<string, Array<VMEvent>>
  structuredResult: StructuredResult | null
  showJson: boolean
  isGeneratingStructured: boolean
}) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight
    }
  }, [messages, structuredResult])

  if (!messages.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <Sparkles size={48} className="mx-auto mb-4 text-pink-400/50" />
          <p className="text-lg font-medium mb-2">Structured Output Demo</p>
          <p className="text-sm max-w-md">
            Ask a question and watch as code analysis transforms into creative
            structured formats!
          </p>
        </div>
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
                ? 'bg-gradient-to-r from-pink-500/5 to-purple-500/5'
                : 'bg-transparent'
            }`}
          >
            <div className="flex items-start gap-4">
              {message.role === 'assistant' ? (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center text-sm font-medium text-white shrink-0">
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

      {/* Structured Output Section */}
      {(isGeneratingStructured || structuredResult) && (
        <div className="mt-6 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-pink-500/50 to-transparent" />
            <span className="text-pink-400 font-medium text-sm uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={16} />
              Structured Output
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-pink-500/50 to-transparent" />
          </div>

          {isGeneratingStructured && !structuredResult && (
            <div className="bg-pink-900/20 border border-pink-500/30 rounded-xl p-6 flex items-center justify-center gap-3">
              <div className="w-6 h-6 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-pink-300 font-medium">
                Generating structured output...
              </span>
            </div>
          )}

          {structuredResult && (
            <StructuredOutputRenderer
              result={structuredResult}
              showJson={showJson}
            />
          )}
        </div>
      )}
    </div>
  )
}

function StructuredOutputPage() {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(
    MODEL_OPTIONS[0],
  )
  const [selectedFormat, setSelectedFormat] = useState<OutputFormat>('blog')
  const [showJson, setShowJson] = useState(false)
  const [toolCallEvents, setToolCallEvents] = useState<
    Map<string, Array<VMEvent>>
  >(new Map())
  const [structuredResult, setStructuredResult] =
    useState<StructuredResult | null>(null)
  const [isGeneratingStructured, setIsGeneratingStructured] = useState(false)
  const eventIdCounter = useRef(0)

  // Create a unique key for the chat hook that changes when model/format changes
  // This forces recreation of the ChatClient with the new body parameters
  const chatKey = `${selectedModel.provider}-${selectedModel.model}-${selectedFormat}`

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
      outputFormat: selectedFormat,
    }),
    [selectedModel.provider, selectedModel.model, selectedFormat],
  )

  const handleCustomEvent = useCallback(
    (eventType: string, data: unknown, context: { toolCallId?: string }) => {
      // Handle structured output result
      if (eventType === 'structured_output:result') {
        const resultData = data as { format: OutputFormat; result: unknown }
        setStructuredResult({
          format: resultData.format,
          data: resultData.result as
            | BlogPost
            | SciFiStory
            | GameShowPitch
            | CountrySong
            | TriviaSet,
        })
        setIsGeneratingStructured(false)
        return
      }

      // Handle structured output error
      if (eventType === 'structured_output:error') {
        console.error('Structured output error:', data)
        setIsGeneratingStructured(false)
        return
      }

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

  // Pass chatKey as id to force recreation when model/format changes
  const { messages, sendMessage, isLoading, stop } = useChat({
    id: chatKey,
    connection: fetchServerSentEvents('/api/structured-output'),
    body,
    onCustomEvent: handleCustomEvent,
  })

  const [input, setInput] = useState('')

  const handleSend = useCallback(
    (message: string) => {
      // Reset state for new query
      setStructuredResult(null)
      setIsGeneratingStructured(true)
      setToolCallEvents(new Map())
      sendMessage(message)
    },
    [sendMessage],
  )

  const selectedFormatOption = OUTPUT_FORMAT_OPTIONS.find(
    (opt) => opt.value === selectedFormat,
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
              opt.model === selectedModel.model,
          )}
          onChange={(e) => {
            const option = MODEL_OPTIONS[parseInt(e.target.value)]
            setSelectedModel(option)
          }}
          disabled={isLoading}
          className="rounded-lg border border-pink-500/20 bg-gray-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-pink-500/50 disabled:opacity-50"
        >
          {MODEL_OPTIONS.map((option, index) => (
            <option key={index} value={index}>
              {option.label}
            </option>
          ))}
        </select>
      </Header>

      <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full overflow-hidden">
        {/* Controls Bar */}
        <div className="border-b border-pink-500/20 bg-gray-800 px-4 py-3">
          <div className="flex items-end gap-4">
            {/* Format Selector */}
            <div className="flex-1">
              <label className="text-sm text-gray-400 mb-2 block">
                Output Format:
              </label>
              <select
                value={selectedFormat}
                onChange={(e) =>
                  setSelectedFormat(e.target.value as OutputFormat)
                }
                disabled={isLoading}
                className="w-full rounded-lg border border-pink-500/20 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50 disabled:opacity-50"
              >
                {OUTPUT_FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.icon} {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* JSON Toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowJson(false)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  !showJson
                    ? 'bg-pink-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Eye size={16} />
                Rendered
              </button>
              <button
                onClick={() => setShowJson(true)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  showJson
                    ? 'bg-pink-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Code size={16} />
                JSON
              </button>
            </div>
          </div>

          {/* Format Description */}
          {selectedFormatOption && (
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-400">
              <span className="text-2xl">{selectedFormatOption.icon}</span>
              <span>{selectedFormatOption.description}</span>
            </div>
          )}
        </div>

        {/* Messages */}
        <Messages
          messages={messages}
          toolCallEvents={toolCallEvents}
          structuredResult={structuredResult}
          showJson={showJson}
          isGeneratingStructured={isGeneratingStructured}
        />

        {/* Input Area */}
        <div className="border-t border-pink-500/10 bg-gray-900/80 backdrop-blur-sm">
          <div className="w-full px-4 py-3 space-y-3">
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
                placeholder="Ask about NPM/GitHub trends and see results in creative formats..."
                className="w-full rounded-lg border border-pink-500/20 bg-gray-800/50 pl-4 pr-12 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-transparent resize-none overflow-hidden shadow-lg"
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
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-pink-500 hover:text-pink-400 disabled:text-gray-500 transition-colors focus:outline-none"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            {/* Prompt Suggestions */}
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
                      handleSend(suggestion.prompt)
                    }
                  }}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-pink-500/20 hover:border-pink-500/40 text-gray-300 hover:text-white rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Message Size Overlay */}
      <MessageSizeOverlay messages={messages} toolCallEvents={toolCallEvents} />
    </div>
  )
}
