'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime } from '@tanstack/ai-openai'
import type { RealtimeMessage } from '@tanstack/ai'
import {
  Phone,
  PhoneOff,
  Send,
  Trash2,
  ChevronDown,
  ChevronRight,
  Code2,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownLeft,
  Terminal,
} from 'lucide-react'
import { Header } from '@/components'
import {
  executePromptRealtimeTools,
  onExecutePromptLog,
} from '@/lib/execute-prompt-realtime-tools'
import type {
  ExecutePromptLogEntry,
  CodeExecution,
} from '@/lib/execute-prompt-realtime-tools'

export const Route = createFileRoute('/_execute-prompt/execute-prompt' as any)({
  component: DashboardDemoPage,
})

const REALTIME_INSTRUCTIONS = `You are a helpful assistant for a shoe product catalog demo.

When the user asks anything about shoes, prices, brands, categories, comparisons, or catalog data, you MUST use the execute_prompt tool. Pass a single clear natural-language prompt describing what to compute or retrieve (the backend runs code-mode analysis over the same product database as the home page).

After you receive tool results, summarize the findings clearly for the user in plain text.

Do not invent catalog data — always use execute_prompt for factual product questions.`

// ---------------------------------------------------------------------------
// Message bubble (left column)
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: RealtimeMessage }) {
  const isUser = message.role === 'user'

  return (
    <div
      className={`p-3 rounded-lg mb-2 ${
        isUser ? 'bg-gray-800/80 mr-8' : 'bg-violet-900/30 ml-8'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-xs font-medium text-white ${
            isUser ? 'bg-gray-600' : 'bg-violet-600'
          }`}
        >
          {isUser ? 'U' : 'AI'}
        </div>
        <div className="flex-1 min-w-0 text-sm text-gray-100 space-y-2">
          {message.parts.map((part, idx) => {
            if (part.type === 'text') {
              return <p key={idx}>{part.content}</p>
            }
            if (part.type === 'audio') {
              return (
                <p key={idx} className="text-gray-300 italic">
                  {part.transcript}
                </p>
              )
            }
            if (part.type === 'tool-call') {
              return (
                <div
                  key={idx}
                  className="rounded border border-violet-500/20 bg-violet-950/30 px-2 py-1 text-xs text-violet-300"
                >
                  <span className="font-mono">{part.name}</span>
                  <span className="text-violet-500 ml-1">called</span>
                </div>
              )
            }
            if (part.type === 'tool-result') {
              return (
                <div
                  key={idx}
                  className="rounded border border-emerald-500/20 bg-emerald-950/20 px-2 py-1 text-xs text-emerald-300"
                >
                  tool result received
                </div>
              )
            }
            return null
          })}
          {message.interrupted && (
            <span className="text-xs text-gray-500">(interrupted)</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Debug panel components (right column)
// ---------------------------------------------------------------------------

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function CodeExecutionCard({
  exec,
  index,
}: {
  exec: CodeExecution
  index: number
}) {
  const [codeOpen, setCodeOpen] = useState(true)
  const [resultOpen, setResultOpen] = useState(true)

  return (
    <div className="rounded border border-gray-700/60 bg-gray-900/60 overflow-hidden">
      {/* Code section */}
      <button
        type="button"
        onClick={() => setCodeOpen(!codeOpen)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-gray-800/50 transition-colors"
      >
        {codeOpen ? (
          <ChevronDown className="w-3 h-3 text-gray-500" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-500" />
        )}
        <Code2 className="w-3 h-3 text-cyan-400" />
        <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold">
          TypeScript Code
        </span>
        <span className="text-[10px] text-gray-600 ml-auto">#{index + 1}</span>
      </button>
      {codeOpen && (
        <pre className="px-2.5 pb-2 text-[11px] leading-relaxed text-gray-300 font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-72 overflow-y-auto bg-black/40 mx-2 mb-2 rounded p-2">
          {exec.typescriptCode}
        </pre>
      )}

      {/* Result section */}
      <div className="border-t border-gray-700/40">
        <button
          type="button"
          onClick={() => setResultOpen(!resultOpen)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-gray-800/50 transition-colors"
        >
          {resultOpen ? (
            <ChevronDown className="w-3 h-3 text-gray-500" />
          ) : (
            <ChevronRight className="w-3 h-3 text-gray-500" />
          )}
          {exec.success ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          ) : (
            <XCircle className="w-3 h-3 text-red-400" />
          )}
          <span
            className={`text-[10px] uppercase tracking-wider font-semibold ${
              exec.success ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {exec.success ? 'Execution Result' : 'Execution Error'}
          </span>
        </button>
        {resultOpen && (
          <div className="px-2.5 pb-2 space-y-1.5">
            {exec.error && (
              <div className="text-xs text-red-300 bg-red-950/40 rounded px-2 py-1.5 font-mono">
                {exec.error.name && (
                  <span className="text-red-500">{exec.error.name}: </span>
                )}
                {exec.error.message}
              </div>
            )}
            {exec.result !== undefined && (
              <pre className="text-[11px] text-emerald-200 font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-48 overflow-y-auto bg-black/40 rounded p-2">
                {typeof exec.result === 'string'
                  ? exec.result
                  : JSON.stringify(exec.result, null, 2)}
              </pre>
            )}
            {exec.logs && exec.logs.length > 0 && (
              <div className="space-y-0.5">
                <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
                  <Terminal className="w-2.5 h-2.5" />
                  Console ({exec.logs.length})
                </div>
                <pre className="text-[11px] text-yellow-200/80 font-mono whitespace-pre-wrap bg-black/40 rounded p-2 max-h-24 overflow-y-auto">
                  {exec.logs.join('\n')}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DebugLogGroup({ entries }: { entries: Array<ExecutePromptLogEntry> }) {
  const reqEntry = entries.find((e) => e.phase === 'request')!
  const resEntry = entries.find((e) => e.phase === 'response')
  const errEntry = entries.find((e) => e.phase === 'error')
  const [expanded, setExpanded] = useState(true)

  const outcome = errEntry ? 'error' : resEntry ? 'success' : 'pending'

  const borderColor =
    outcome === 'error'
      ? 'border-red-600/30'
      : outcome === 'success'
        ? 'border-emerald-600/30'
        : 'border-cyan-600/30'

  return (
    <div
      className={`rounded-lg border ${borderColor} bg-gray-900/40 mb-3 overflow-hidden`}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-gray-800/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />
        )}

        {outcome === 'pending' && (
          <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shrink-0" />
        )}
        {outcome === 'success' && (
          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
        )}
        {outcome === 'error' && (
          <XCircle className="w-3 h-3 text-red-400 shrink-0" />
        )}

        <span className="text-xs text-gray-200 truncate flex-1 min-w-0">
          {reqEntry.prompt}
        </span>

        <span className="text-[10px] text-gray-600 font-mono shrink-0">
          {formatTime(reqEntry.timestamp)}
        </span>
        {(resEntry?.durationMs ?? errEntry?.durationMs) != null && (
          <span className="text-[10px] text-gray-500 font-mono shrink-0">
            {((resEntry?.durationMs ?? errEntry?.durationMs)! / 1000).toFixed(
              1,
            )}
            s
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Request */}
          <div className="flex items-start gap-2">
            <ArrowUpRight className="w-3 h-3 text-cyan-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-cyan-500 uppercase tracking-wider font-semibold mb-0.5">
                Prompt sent to server
              </div>
              <p className="text-xs text-gray-300 whitespace-pre-wrap break-words">
                {reqEntry.prompt}
              </p>
            </div>
          </div>

          {/* Code executions */}
          {resEntry?.executions && resEntry.executions.length > 0 && (
            <div className="space-y-2">
              {resEntry.executions.map((exec, i) => (
                <CodeExecutionCard key={i} exec={exec} index={i} />
              ))}
            </div>
          )}

          {/* Final response data */}
          {resEntry && (
            <div className="flex items-start gap-2">
              <ArrowDownLeft className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-emerald-500 uppercase tracking-wider font-semibold mb-0.5">
                  Final JSON returned
                </div>
                <pre className="text-[11px] text-gray-300 font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-40 overflow-y-auto bg-black/30 rounded p-2">
                  {typeof resEntry.data === 'string'
                    ? resEntry.data
                    : JSON.stringify(resEntry.data, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Error */}
          {errEntry && (
            <div className="flex items-start gap-2">
              <XCircle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] text-red-500 uppercase tracking-wider font-semibold mb-0.5">
                  Error
                </div>
                <p className="text-xs text-red-300 whitespace-pre-wrap break-words">
                  {errEntry.error}
                </p>
              </div>
            </div>
          )}

          {/* Pending */}
          {outcome === 'pending' && (
            <div className="flex items-center gap-2 text-xs text-cyan-400">
              <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              Running execute_prompt on server…
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function DashboardDemoPage() {
  const [textInput, setTextInput] = useState('')
  const [logEntries, setLogEntries] = useState<Array<ExecutePromptLogEntry>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return onExecutePromptLog((entry) => {
      setLogEntries((prev) => [...prev, entry])
    })
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logEntries])

  const clearLog = useCallback(() => setLogEntries([]), [])

  const {
    status,
    mode,
    messages,
    pendingUserTranscript,
    pendingAssistantTranscript,
    error,
    connect,
    disconnect,
    interrupt,
    sendText,
  } = useRealtimeChat({
    getToken: () =>
      fetch('/api/realtime-token', { method: 'POST' }).then((r) => {
        if (!r.ok) {
          return r.json().then((body) => {
            throw new Error((body as { error?: string }).error || r.statusText)
          })
        }
        return r.json()
      }),
    adapter: openaiRealtime(),
    instructions: REALTIME_INSTRUCTIONS,
    tools: [...executePromptRealtimeTools],
    voice: 'alloy',
    outputModalities: ['text'],
    autoCapture: false,
    autoPlayback: false,
    temperature: 0.8,
    onError: (err) => {
      console.error('Realtime error:', err)
    },
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pendingUserTranscript, pendingAssistantTranscript])

  const statusDot =
    status === 'connected'
      ? 'bg-green-500'
      : status === 'connecting' || status === 'reconnecting'
        ? 'bg-yellow-500'
        : status === 'error'
          ? 'bg-red-500'
          : 'bg-gray-500'

  // Group log entries by request id
  const logGroups: Array<{
    id: string
    entries: Array<ExecutePromptLogEntry>
  }> = []
  const groupMap = new Map<string, Array<ExecutePromptLogEntry>>()
  for (const entry of logEntries) {
    let group = groupMap.get(entry.id)
    if (!group) {
      group = []
      groupMap.set(entry.id, group)
      logGroups.push({ id: entry.id, entries: group })
    }
    group.push(entry)
  }

  const requestCount = logGroups.length
  const errorCount = logEntries.filter((e) => e.phase === 'error').length

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <Header />

      <div className="flex-1 flex min-h-0">
        {/* ── Left column: Chat ─────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-gray-800">
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-lg font-semibold text-white">Execute Prompt</h2>
            <p className="text-xs text-gray-400 mt-1">
              Connect, then ask about the shoe catalog.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <div className={`w-2 h-2 rounded-full ${statusDot}`} />
              <span className="text-xs text-gray-400 capitalize">
                {status}
                {mode !== 'idle' ? ` · ${mode}` : ''}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-2 min-h-0">
            <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-3 min-h-full">
              {messages.length === 0 && status === 'idle' && (
                <p className="text-sm text-gray-500 text-center py-12">
                  Connect to start. Try: &quot;What&apos;s the cheapest running
                  shoe?&quot; or &quot;Compare Nike vs Adidas average
                  price.&quot;
                </p>
              )}
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {pendingUserTranscript && (
                <p className="text-sm text-gray-500 italic px-3">
                  {pendingUserTranscript}…
                </p>
              )}
              {pendingAssistantTranscript && (
                <p className="text-sm text-violet-300/80 italic px-3">
                  {pendingAssistantTranscript}…
                </p>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {error && (
            <div className="mx-4 mb-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
              {error.message}
            </div>
          )}

          {status === 'connected' && (
            <form
              className="mx-4 mb-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const t = textInput.trim()
                if (!t) return
                sendText(t)
                setTextInput('')
              }}
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Ask about the shoe catalog…"
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
              <button
                type="submit"
                disabled={!textInput.trim()}
                className="flex items-center justify-center w-11 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white"
                aria-label="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}

          <div className="px-4 pb-4 flex justify-center gap-3">
            {status === 'idle' || status === 'error' ? (
              <button
                type="button"
                onClick={() => void connect()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium"
              >
                <Phone className="w-4 h-4" />
                Connect
              </button>
            ) : (
              <>
                {mode === 'speaking' && (
                  <button
                    type="button"
                    onClick={() => void interrupt()}
                    className="px-4 py-2 rounded-lg bg-yellow-600/90 hover:bg-yellow-600 text-white text-sm"
                  >
                    Interrupt
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void disconnect()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
                >
                  <PhoneOff className="w-4 h-4" />
                  Disconnect
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Right column: Debug log ──────────────────────────── */}
        <div className="w-[520px] shrink-0 flex flex-col min-h-0 bg-gray-950/60">
          <div className="px-4 pt-4 pb-2 border-b border-gray-800 flex items-center gap-3">
            <Code2 className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-gray-200">
              execute_prompt inspector
            </h3>
            <div className="flex items-center gap-2 ml-auto text-[10px] font-mono text-gray-500">
              <span>
                {requestCount} call{requestCount !== 1 ? 's' : ''}
              </span>
              {errorCount > 0 && (
                <span className="text-red-400">
                  {errorCount} err{errorCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={clearLog}
              className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Clear log"
              title="Clear log"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
            {logGroups.length === 0 ? (
              <div className="text-center mt-12 space-y-2">
                <Code2 className="w-8 h-8 text-gray-700 mx-auto" />
                <p className="text-xs text-gray-600">
                  No execute_prompt calls yet.
                  <br />
                  Ask a question to see the generated TypeScript code,
                  <br />
                  execution results, and final response.
                </p>
              </div>
            ) : (
              logGroups.map((group) => (
                <DebugLogGroup key={group.id} entries={group.entries} />
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  )
}
