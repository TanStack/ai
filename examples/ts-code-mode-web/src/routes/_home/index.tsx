import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  Square,
  Trash2,
  X,
  RefreshCw,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { parsePartialJSON } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { VMEvent } from '@/components'
import { CodeBlock, ExecutionResult, JavaScriptVM, Header } from '@/components'

export const Route = createFileRoute('/_home/')({
  component: ProductDemoPage,
})

type Provider = 'anthropic' | 'openai' | 'gemini'

interface ModelOption {
  provider: Provider
  model: string
  label: string
}

interface SkillWithCode {
  id: string
  name: string
  description: string
  code: string
  trustLevel: 'untrusted' | 'provisional' | 'trusted'
  usageHints?: Array<string>
  stats?: { executions: number; successRate: number }
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

// --- Stats Types ---

const TOOL_NAMES = [
  'execute_typescript',
  'getProductListPage',
  'getProductByID',
] as const

interface PanelStats {
  llmCalls: number
  toolCalls: number
  toolCallsByName: Record<string, number>
  contextBytes: number
  durationMs: number | null
}

const DEFAULT_STATS: PanelStats = {
  llmCalls: 0,
  toolCalls: 0,
  toolCallsByName: {},
  contextBytes: 0,
  durationMs: null,
}

// --- Versus Scoreboard ---

function VersusStats({
  leftStats,
  rightStats,
  withSkills,
  onWithSkillsChange,
  skillCount,
  onSkillsButtonClick,
  cmLoading,
  onCmStop,
  regLoading,
  onRegStop,
}: {
  leftStats: PanelStats
  rightStats: PanelStats
  withSkills: boolean
  onWithSkillsChange: (v: boolean) => void
  skillCount: number
  onSkillsButtonClick: () => void
  cmLoading: boolean
  onCmStop: () => void
  regLoading: boolean
  onRegStop: () => void
}) {
  const rows = useMemo(() => {
    const compare = (l: number | null, r: number | null) => {
      if (l === null || r === null || l === 0 || r === 0)
        return { leftWins: false, rightWins: false }
      if (l < r) return { leftWins: true, rightWins: false }
      if (r < l) return { leftWins: false, rightWins: true }
      return { leftWins: false, rightWins: false }
    }

    const fmtKB = (bytes: number) =>
      bytes > 0 ? (bytes / 1024).toFixed(1) : '—'
    const fmtSec = (ms: number | null) =>
      ms !== null ? String(Math.round(ms / 1000)) : '—'

    return [
      {
        label: 'LLM Calls',
        left: String(leftStats.llmCalls),
        right: String(rightStats.llmCalls),
        ...compare(leftStats.llmCalls, rightStats.llmCalls),
      },
      {
        label: 'Context (KB)',
        left: fmtKB(leftStats.contextBytes),
        right: fmtKB(rightStats.contextBytes),
        ...compare(leftStats.contextBytes, rightStats.contextBytes),
      },
      {
        label: 'Duration (s)',
        left: fmtSec(leftStats.durationMs),
        right: fmtSec(rightStats.durationMs),
        ...compare(leftStats.durationMs, rightStats.durationMs),
      },
    ]
  }, [leftStats, rightStats])

  return (
    <div className="w-108 shrink-0 flex flex-col bg-gray-950/80 border-x border-gray-700/30">
      <div className="relative h-14 bg-linear-to-r from-cyan-500/25 via-gray-900/60 to-amber-500/25 flex items-center justify-center">
        <span className="text-2xl font-black tracking-[0.5em] text-white/15 uppercase select-none">
          vs
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-5 px-4 py-4">
        {/* Images row with titles underneath */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col items-center gap-2">
            <img
              src="/coco-code-mode.png"
              alt="Code Mode"
              className="w-32 h-32 object-contain"
            />
            <span className="text-2xl font-bold text-cyan-300 tracking-wide mt-[-20px]">
              Code Mode
            </span>
            <div className="flex flex-col items-center gap-1.5">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={withSkills}
                  onChange={(e) => onWithSkillsChange(e.target.checked)}
                  className="w-3.5 h-3.5 accent-purple-500"
                />
                <span className="text-[11px] text-gray-400">With Skills</span>
              </label>
              {withSkills && (
                <button
                  onClick={onSkillsButtonClick}
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 rounded transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  {skillCount} Skills
                </button>
              )}
              {cmLoading && (
                <button
                  onClick={onCmStop}
                  className="px-2 py-0.5 bg-red-600/80 hover:bg-red-600 text-white rounded text-[10px] font-medium transition-colors flex items-center gap-1"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  Stop
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <img
              src="/coco-regular-tools.png"
              alt="Regular Tools"
              className="w-32 h-32 object-contain"
            />
            <span className="text-2xl font-bold text-amber-300 tracking-wide mt-[-20px]">
              Regular Tools
            </span>
            {regLoading && (
              <button
                onClick={onRegStop}
                className="px-2 py-0.5 bg-red-600/80 hover:bg-red-600 text-white rounded text-[10px] font-medium transition-colors flex items-center gap-1"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Stats rows: label spans both columns, values centered under each character */}
        {rows.map(({ label, left, right, leftWins, rightWins }) => (
          <div key={label} className="space-y-1">
            <div className="text-sm text-center uppercase tracking-widest text-gray-500 font-semibold">
              {label}
            </div>
            <div className="grid grid-cols-2">
              <div className="flex justify-center">
                <span
                  className={`font-mono text-2xl tabular-nums ${
                    leftWins ? 'text-cyan-400 font-bold' : 'text-gray-400'
                  }`}
                >
                  {left}
                </span>
              </div>
              <div className="flex justify-center">
                <span
                  className={`font-mono text-2xl tabular-nums ${
                    rightWins ? 'text-amber-400 font-bold' : 'text-gray-400'
                  }`}
                >
                  {right}
                </span>
              </div>
            </div>
          </div>
        ))}

        {/* Tool Calls breakdown — three centered columns */}
        <div className="space-y-1">
          <div className="text-sm text-center uppercase tracking-widest text-gray-500 font-semibold">
            Tool Calls
          </div>
          {TOOL_NAMES.map((toolName) => {
            const leftVal = leftStats.toolCallsByName[toolName] ?? 0
            const rightVal =
              toolName === 'execute_typescript'
                ? null
                : (rightStats.toolCallsByName[toolName] ?? 0)
            const leftWins =
              rightVal !== null &&
              leftVal > 0 &&
              rightVal > 0 &&
              leftVal < rightVal
            const rightWins =
              rightVal !== null &&
              leftVal > 0 &&
              rightVal > 0 &&
              rightVal < leftVal
            return (
              <div
                key={toolName}
                className="grid grid-cols-3 gap-1 text-center items-center"
              >
                <div className="text-[10px] font-mono text-gray-500 truncate text-center">
                  {toolName}
                </div>
                <div className="flex justify-center">
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      leftWins ? 'text-cyan-400 font-bold' : 'text-gray-400'
                    }`}
                  >
                    {leftVal}
                  </span>
                </div>
                <div className="flex justify-center">
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      rightWins ? 'text-amber-400 font-bold' : 'text-gray-400'
                    }`}
                  >
                    {rightVal === null ? '—' : rightVal}
                  </span>
                </div>
              </div>
            )
          })}
          <div className="grid grid-cols-3 gap-1 text-center items-center pt-1 mt-1 border-t border-gray-700/50">
            <div className="text-[10px] text-gray-500 font-medium text-center">
              Total
            </div>
            <div className="flex justify-center">
              <span className="font-mono text-lg tabular-nums font-semibold text-gray-300">
                {leftStats.toolCalls}
              </span>
            </div>
            <div className="flex justify-center">
              <span className="font-mono text-lg tabular-nums font-semibold text-gray-300">
                {rightStats.toolCalls}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="h-px bg-linear-to-r from-cyan-500/50 via-gray-700/50 to-amber-500/50" />
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

// --- Skills Dialog ---

function SkillsDialog({
  open,
  onClose,
  skills,
  onDelete,
  onDeleteAll,
  onRefresh,
  isLoading,
}: {
  open: boolean
  onClose: () => void
  skills: Array<SkillWithCode>
  onDelete: (name: string) => void
  onDeleteAll: () => void
  onRefresh: () => void
  isLoading: boolean
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!open) return null

  const trustColors: Record<string, string> = {
    untrusted: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    provisional: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    trusted: 'bg-green-500/20 text-green-400 border-green-500/30',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-2xl max-h-[80vh] flex flex-col bg-gray-900 border border-gray-700 rounded-xl shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <h2 className="font-semibold text-white">
              Registered Skills
              <span className="ml-2 text-sm text-gray-400 font-normal">
                ({skills.length})
              </span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors disabled:opacity-50"
              title="Refresh skills"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>
            {skills.length > 0 && (
              <button
                onClick={() => {
                  if (confirm(`Delete all ${skills.length} skills?`)) {
                    onDeleteAll()
                  }
                }}
                className="px-3 py-1.5 text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete All
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Skills list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {skills.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <Sparkles className="w-8 h-8 mx-auto mb-3 text-gray-600" />
              <p className="text-sm font-medium">No skills registered yet</p>
              <p className="text-xs mt-1 text-gray-600">
                Enable "With Skills" and the AI will create reusable skills as
                it works.
              </p>
            </div>
          ) : (
            skills.map((skill) => {
              const isExpanded = expandedId === skill.id
              return (
                <div
                  key={skill.id}
                  className="rounded-lg border border-gray-700 overflow-hidden"
                >
                  {/* Accordion header */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800/50 hover:bg-gray-800 transition-colors text-left"
                    onClick={() => setExpandedId(isExpanded ? null : skill.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono text-purple-300">
                          skill_{skill.name}
                        </code>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded border ${trustColors[skill.trustLevel] ?? ''}`}
                        >
                          {skill.trustLevel}
                        </span>
                      </div>
                      {skill.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {skill.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete skill "${skill.name}"?`)) {
                          onDelete(skill.name)
                        }
                      }}
                      className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                      title="Delete skill"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </button>

                  {/* Accordion body - TypeScript code */}
                  {isExpanded && (
                    <div className="border-t border-gray-700 bg-gray-950">
                      <pre className="p-4 text-xs text-gray-300 overflow-x-auto max-h-64 overflow-y-auto font-mono leading-relaxed">
                        {skill.code || '// No code available'}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// --- Code Mode Panel (isolated useChat) ---

function CodeModePanel({
  body,
  promptRef,
  triggerCount,
  onLoadingChange,
  onNewSkill,
  onStatsChange,
  onStopReady,
}: {
  body: { provider: string; model: string }
  promptRef: React.RefObject<string>
  triggerCount: number
  onLoadingChange: (loading: boolean) => void
  onNewSkill: () => void
  onStatsChange: (stats: PanelStats) => void
  onStopReady?: (stop: () => void) => void
}) {
  const llmCallsBase = useRef(0)
  const contextBytesBase = useRef(0)
  const [llmCallsCurrent, setLlmCallsCurrent] = useState(0)
  const [contextBytesCurrent, setContextBytesCurrent] = useState(0)
  const [totalTimeMs, setTotalTimeMs] = useState<number | null>(null)
  const [toolCallEvents, setToolCallEvents] = useState<
    Map<string, Array<VMEvent>>
  >(new Map())
  const eventIdCounter = useRef(0)

  const handleCustomEvent = useCallback(
    (eventType: string, data: unknown, context: { toolCallId?: string }) => {
      if (eventType === 'product_codemode:llm_call') {
        const d = data as { count?: number; totalContextBytes?: number }
        if (typeof d?.count === 'number')
          setLlmCallsCurrent((p) => Math.max(p, d.count!))
        if (typeof d?.totalContextBytes === 'number')
          setContextBytesCurrent(d.totalContextBytes)
        return
      }
      if (eventType === 'product_codemode:chat_start') {
        return
      }
      if (eventType === 'product_codemode:chat_end') {
        const d = data as { durationMs?: number }
        if (typeof d?.durationMs === 'number')
          setTotalTimeMs((prev) => (prev ?? 0) + d.durationMs!)
        return
      }

      if (eventType === 'skill:registered') {
        onNewSkill()
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
    [onNewSkill],
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

    llmCallsBase.current += llmCallsCurrent
    contextBytesBase.current += contextBytesCurrent
    setLlmCallsCurrent(0)
    setContextBytesCurrent(0)
    setToolCallEvents(new Map())
    eventIdCounter.current = 0

    sendMessage(prompt)
  }, [triggerCount]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onStopReady?.(stop)
  }, [stop, onStopReady])

  const { toolCalls, toolCallsByName } = useMemo(() => {
    let count = 0
    const byName: Record<string, number> = {}
    for (const m of messages) {
      for (const p of m.parts) {
        if (p.type === 'tool-call') {
          count++
          const name = p.name
          byName[name] = (byName[name] ?? 0) + 1
        }
      }
    }
    return { toolCalls: count, toolCallsByName: byName }
  }, [messages])

  const toolCallsByNameRef = useRef(toolCallsByName)
  toolCallsByNameRef.current = toolCallsByName

  useEffect(() => {
    onStatsChange({
      llmCalls: llmCallsBase.current + llmCallsCurrent,
      toolCalls,
      toolCallsByName: toolCallsByNameRef.current,
      contextBytes: contextBytesBase.current + contextBytesCurrent,
      durationMs: totalTimeMs,
    })
  }, [
    llmCallsCurrent,
    toolCalls,
    contextBytesCurrent,
    totalTimeMs,
    onStatsChange,
  ])

  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="flex-1 flex flex-col min-w-0 border-r border-gray-700/50">
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
  onStatsChange,
  onStopReady,
}: {
  body: { provider: string; model: string }
  promptRef: React.RefObject<string>
  triggerCount: number
  onLoadingChange: (loading: boolean) => void
  onStatsChange: (stats: PanelStats) => void
  onStopReady?: (stop: () => void) => void
}) {
  const llmCallsBase = useRef(0)
  const contextBytesBase = useRef(0)
  const [llmCallsCurrent, setLlmCallsCurrent] = useState(0)
  const [contextBytesCurrent, setContextBytesCurrent] = useState(0)
  const [totalTimeMs, setTotalTimeMs] = useState<number | null>(null)

  const handleCustomEvent = useCallback((eventType: string, data: unknown) => {
    if (eventType === 'product_regular:llm_call') {
      const d = data as { count?: number; totalContextBytes?: number }
      if (typeof d?.count === 'number')
        setLlmCallsCurrent((p) => Math.max(p, d.count!))
      if (typeof d?.totalContextBytes === 'number')
        setContextBytesCurrent(d.totalContextBytes)
      return
    }
    if (eventType === 'product_regular:chat_start') {
      return
    }
    if (eventType === 'product_regular:chat_end') {
      const d = data as { durationMs?: number }
      if (typeof d?.durationMs === 'number')
        setTotalTimeMs((prev) => (prev ?? 0) + d.durationMs!)
    }
  }, [])

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

    llmCallsBase.current += llmCallsCurrent
    contextBytesBase.current += contextBytesCurrent
    setLlmCallsCurrent(0)
    setContextBytesCurrent(0)

    sendMessage(prompt)
  }, [triggerCount]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onStopReady?.(stop)
  }, [stop, onStopReady])

  const { toolCalls, toolCallsByName } = useMemo(() => {
    let count = 0
    const byName: Record<string, number> = {}
    for (const m of messages) {
      for (const p of m.parts) {
        if (p.type === 'tool-call') {
          count++
          const name = p.name
          byName[name] = (byName[name] ?? 0) + 1
        }
      }
    }
    return { toolCalls: count, toolCallsByName: byName }
  }, [messages])

  const toolCallsByNameRef = useRef(toolCallsByName)
  toolCallsByNameRef.current = toolCallsByName

  useEffect(() => {
    onStatsChange({
      llmCalls: llmCallsBase.current + llmCallsCurrent,
      toolCalls,
      toolCallsByName: toolCallsByNameRef.current,
      contextBytes: contextBytesBase.current + contextBytesCurrent,
      durationMs: totalTimeMs,
    })
  }, [
    llmCallsCurrent,
    toolCalls,
    contextBytesCurrent,
    totalTimeMs,
    onStatsChange,
  ])

  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="flex-1 flex flex-col min-w-0">
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

  // Skills state
  const [withSkills, setWithSkills] = useState(false)
  const [skills, setSkills] = useState<Array<SkillWithCode>>([])
  const [isLoadingSkills, setIsLoadingSkills] = useState(false)
  const [skillsDialogOpen, setSkillsDialogOpen] = useState(false)

  const promptRef = useRef('')
  const [cmTriggerCount, setCmTriggerCount] = useState(0)
  const [regTriggerCount, setRegTriggerCount] = useState(0)

  const isLoading = cmLoading || regLoading

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
      withSkills,
    }),
    [selectedModel.provider, selectedModel.model, withSkills],
  )

  const loadSkills = useCallback(async () => {
    setIsLoadingSkills(true)
    try {
      const response = await fetch('/api/skills')
      if (response.ok) {
        const data = await response.json()
        setSkills(data)
      }
    } catch (error) {
      console.error('Failed to load skills:', error)
    } finally {
      setIsLoadingSkills(false)
    }
  }, [])

  const deleteSkill = useCallback(async (name: string) => {
    try {
      const response = await fetch(
        `/api/skills?name=${encodeURIComponent(name)}`,
        {
          method: 'DELETE',
        },
      )
      if (response.ok) {
        setSkills((prev) => prev.filter((s) => s.name !== name))
      }
    } catch (error) {
      console.error('Failed to delete skill:', error)
    }
  }, [])

  const deleteAllSkills = useCallback(async () => {
    try {
      const response = await fetch('/api/skills?all=true', { method: 'DELETE' })
      if (response.ok) {
        setSkills([])
      }
    } catch (error) {
      console.error('Failed to delete all skills:', error)
    }
  }, [])

  const handleNewSkill = useCallback(() => {
    loadSkills()
  }, [loadSkills])

  // Load skills when "With Skills" is first enabled
  useEffect(() => {
    if (withSkills) {
      loadSkills()
    }
  }, [withSkills, loadSkills])

  const handleSendCodeMode = useCallback((text: string) => {
    promptRef.current = text
    setCmTriggerCount((c) => c + 1)
  }, [])
  const handleSendRegular = useCallback((text: string) => {
    promptRef.current = text
    setRegTriggerCount((c) => c + 1)
  }, [])
  const handleSendBoth = useCallback((text: string) => {
    promptRef.current = text
    setCmTriggerCount((c) => c + 1)
    setRegTriggerCount((c) => c + 1)
  }, [])

  const [cmStats, setCmStats] = useState<PanelStats>(DEFAULT_STATS)
  const [regStats, setRegStats] = useState<PanelStats>(DEFAULT_STATS)
  const cmStopRef = useRef<(() => void) | null>(null)
  const regStopRef = useRef<(() => void) | null>(null)

  const onCmLoadingChange = useCallback((v: boolean) => setCmLoading(v), [])
  const onRegLoadingChange = useCallback((v: boolean) => setRegLoading(v), [])
  const onCmStatsChange = useCallback((s: PanelStats) => setCmStats(s), [])
  const onRegStatsChange = useCallback((s: PanelStats) => setRegStats(s), [])
  const onCmStopReady = useCallback((stop: () => void) => {
    cmStopRef.current = stop
  }, [])
  const onRegStopReady = useCallback((stop: () => void) => {
    regStopRef.current = stop
  }, [])

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

      {/* Three-column layout: Code Mode | VS Stats | Regular Tools */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <CodeModePanel
          body={body}
          promptRef={promptRef}
          triggerCount={cmTriggerCount}
          onLoadingChange={onCmLoadingChange}
          onNewSkill={handleNewSkill}
          onStatsChange={onCmStatsChange}
          onStopReady={onCmStopReady}
        />
        <VersusStats
          leftStats={cmStats}
          rightStats={regStats}
          withSkills={withSkills}
          onWithSkillsChange={setWithSkills}
          skillCount={skills.length}
          onSkillsButtonClick={() => setSkillsDialogOpen(true)}
          cmLoading={cmLoading}
          onCmStop={() => cmStopRef.current?.()}
          regLoading={regLoading}
          onRegStop={() => regStopRef.current?.()}
        />
        <RegularToolsPanel
          body={body}
          promptRef={promptRef}
          triggerCount={regTriggerCount}
          onLoadingChange={onRegLoadingChange}
          onStatsChange={onRegStatsChange}
          onStopReady={onRegStopReady}
        />
      </div>

      {/* Skills Dialog */}
      <SkillsDialog
        open={skillsDialogOpen}
        onClose={() => setSkillsDialogOpen(false)}
        skills={skills}
        onDelete={deleteSkill}
        onDeleteAll={deleteAllSkills}
        onRefresh={loadSkills}
        isLoading={isLoadingSkills}
      />

      {/* Shared input: suggestions set prompt; action buttons on the right */}
      <div className="border-t border-cyan-500/10 bg-gray-900/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2">
            {PROMPT_SUGGESTIONS.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => setInput(suggestion.prompt)}
                className="shrink-0 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-cyan-500/20 hover:border-cyan-500/40 text-gray-300 hover:text-white rounded-full transition-all"
              >
                {suggestion.label}
              </button>
            ))}
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question about the shoe catalog..."
                className="w-full rounded-lg border border-cyan-500/20 bg-gray-800/50 pl-4 pr-4 py-2.5 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-transparent resize-none overflow-hidden shadow-lg"
                rows={1}
                style={{ minHeight: '40px', maxHeight: '200px' }}
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
                    handleSendBoth(input)
                    setInput('')
                  }
                }}
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => input.trim() && handleSendCodeMode(input)}
                disabled={!input.trim() || cmLoading}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Code Mode
              </button>
              <button
                onClick={() => input.trim() && handleSendRegular(input)}
                disabled={!input.trim() || regLoading}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Regular Tools
              </button>
              <button
                onClick={() => {
                  if (input.trim()) {
                    handleSendBoth(input)
                    setInput('')
                  }
                }}
                disabled={!input.trim() || cmLoading || regLoading}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-500/30 bg-gray-500/10 hover:bg-gray-500/20 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Run In Both
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
