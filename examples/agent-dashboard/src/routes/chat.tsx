import { createFileRoute } from '@tanstack/react-router'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useEffect, useState } from 'react'
import { messages, toolCalls } from '@/db/collections'
import { ensureSession, sendPrompt } from '@/lib/session-controller'
import type { MessageRow, ToolCallRow } from '@/db/collections'

export const Route = createFileRoute('/chat')({
  component: MetaChat,
})

const ENDPOINT = '/api/meta'
const QUICK = [
  'List the agents on this host',
  'How many runs so far?',
  'What can you configure?',
  'Summarize the latest session',
]

function MetaChat() {
  const [threadId] = useState(
    () => `meta-${Math.random().toString(36).slice(2, 8)}`,
  )
  const [input, setInput] = useState('')

  useEffect(() => {
    ensureSession(threadId, ENDPOINT)
  }, [threadId])

  const { data: msgs = [] } = useLiveQuery(
    (q) => q.from({ m: messages }).where(({ m }) => eq(m.threadId, threadId)),
    [threadId],
  )
  const { data: tools = [] } = useLiveQuery(
    (q) => q.from({ t: toolCalls }).where(({ t }) => eq(t.threadId, threadId)),
    [threadId],
  )

  const timeline = [
    ...(msgs as Array<MessageRow>).map((m) => ({
      kind: 'm' as const,
      at: m.createdAt,
      m,
    })),
    ...(tools as Array<ToolCallRow>).map((t) => ({
      kind: 't' as const,
      at: t.createdAt,
      t,
    })),
  ].sort((a, b) => a.at - b.at)

  const send = async (text: string) => {
    const t = text.trim()
    if (!t) return
    setInput('')
    await sendPrompt(threadId, t, ENDPOINT)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Meta-chat</h1>
        <p className="text-sm text-white/50">
          The dashboard's own agent. It uses tools over live state — every tool
          call it makes shows up right here (and in history).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 hover:bg-white/[0.05]"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="min-h-40 space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
        {timeline.length === 0 && (
          <p className="text-sm text-white/40">
            Ask the dashboard something about its agents, runs, or config.
          </p>
        )}
        {timeline.map((e) =>
          e.kind === 'm' ? (
            <div
              key={e.m.id}
              className={e.m.role === 'user' ? 'text-right' : ''}
            >
              <div
                className={`inline-block max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  e.m.role === 'user'
                    ? 'bg-emerald-500/15 text-emerald-100'
                    : 'bg-white/[0.06]'
                }`}
              >
                {e.m.text || <span className="text-white/30">…</span>}
              </div>
            </div>
          ) : (
            <div
              key={e.t.id}
              className="rounded-md border border-white/10 bg-black/20 p-2 font-mono text-xs"
            >
              <span className="text-sky-300">🔧 {e.t.name}</span>
              {e.t.result && (
                <div className="mt-1 text-emerald-200/70">
                  → {e.t.result.slice(0, 200)}
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(input)}
          placeholder="Ask the dashboard…"
          className="flex-1 rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-white/30"
        />
        <button
          onClick={() => send(input)}
          className="rounded-md bg-emerald-500/90 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400"
        >
          Send
        </button>
      </div>
    </div>
  )
}
