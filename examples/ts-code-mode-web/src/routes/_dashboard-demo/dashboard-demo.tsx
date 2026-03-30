'use client'

import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime } from '@tanstack/ai-openai'
import type { RealtimeMessage } from '@tanstack/ai'
import { Phone, PhoneOff, Send } from 'lucide-react'
import { Header } from '@/components'
import { dashboardRealtimeTools } from '@/lib/dashboard-realtime-tools'

export const Route = createFileRoute('/_dashboard-demo/dashboard-demo' as any)({
  component: DashboardDemoPage,
})

const REALTIME_INSTRUCTIONS = `You are a helpful assistant for a shoe product catalog demo.

When the user asks anything about shoes, prices, brands, categories, comparisons, or catalog data, you MUST use the execute_prompt tool. Pass a single clear natural-language prompt describing what to compute or retrieve (the backend runs code-mode analysis over the same product database as the home page).

After you receive tool results, summarize the findings clearly for the user in plain text.

Do not invent catalog data — always use execute_prompt for factual product questions.`

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
              let args: unknown = part.arguments
              try {
                args = JSON.parse(part.arguments)
              } catch {
                /* keep string */
              }
              return (
                <div
                  key={idx}
                  className="rounded border border-violet-500/30 bg-violet-950/40 px-2 py-1.5 font-mono text-xs text-violet-200"
                >
                  <div className="text-violet-400 mb-1">{part.name}</div>
                  <pre className="whitespace-pre-wrap break-words overflow-x-auto">
                    {typeof args === 'string'
                      ? args
                      : JSON.stringify(args, null, 2)}
                  </pre>
                </div>
              )
            }
            if (part.type === 'tool-result') {
              let parsed: unknown = part.content
              try {
                parsed = JSON.parse(part.content)
              } catch {
                /* keep string */
              }
              return (
                <div
                  key={idx}
                  className="rounded border border-emerald-500/30 bg-emerald-950/30 px-2 py-1.5 font-mono text-xs text-emerald-100"
                >
                  <div className="text-emerald-400 mb-1">result</div>
                  <pre className="whitespace-pre-wrap break-words overflow-x-auto max-h-48 overflow-y-auto">
                    {typeof parsed === 'string'
                      ? parsed
                      : JSON.stringify(parsed, null, 2)}
                  </pre>
                </div>
              )
            }
            if (part.type === 'image') {
              return (
                <p key={idx} className="text-gray-400 text-xs">
                  [image]
                </p>
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

function DashboardDemoPage() {
  const [textInput, setTextInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

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
            throw new Error(
              (body as { error?: string }).error || r.statusText,
            )
          })
        }
        return r.json()
      }),
    adapter: openaiRealtime(),
    instructions: REALTIME_INSTRUCTIONS,
    tools: [...dashboardRealtimeTools],
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

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <Header />
      <div className="flex-1 flex flex-col max-w-3xl w-full mx-auto px-4 py-4 min-h-0">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-white">
            Dashboard — Realtime (text) + execute_prompt
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Connect, then ask about the shoe catalog. The model calls{' '}
            <code className="text-violet-300">execute_prompt</code> on the
            server (same product data as the home page).
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-2 h-2 rounded-full ${statusDot}`} />
            <span className="text-xs text-gray-400 capitalize">
              {status}
              {mode !== 'idle' ? ` · ${mode}` : ''}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto rounded-lg border border-gray-800 bg-gray-950/50 p-3 min-h-0">
          {messages.length === 0 && status === 'idle' && (
            <p className="text-sm text-gray-500 text-center py-12">
              Connect to start. Try: &quot;What&apos;s the cheapest running
              shoe?&quot; or &quot;Compare Nike vs Adidas average price.&quot;
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

        {error && (
          <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            {error.message}
          </div>
        )}

        {status === 'connected' && (
          <form
            className="mt-3 flex gap-2"
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

        <div className="mt-4 flex justify-center gap-3">
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
    </div>
  )
}
