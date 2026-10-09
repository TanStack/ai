import { createFileRoute } from '@tanstack/react-router'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useEffect, useState } from 'react'
import { messages, toolCalls } from '@/db/collections'
import { ensureSession, sendPrompt } from '@/lib/session-controller'
import { Composer, Stream, buildTimeline } from '@/components/stream'
import type { MessageRow, ToolCallRow } from '@/db/collections'

export const Route = createFileRoute('/chat')({
  component: MetaChat,
})

const HARNESS = 'dashboard/meta'
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
    ensureSession(threadId, HARNESS)
  }, [threadId])

  const { data: msgs = [] } = useLiveQuery(
    (q) => q.from({ m: messages }).where(({ m }) => eq(m.threadId, threadId)),
    [threadId],
  )
  const { data: tools = [] } = useLiveQuery(
    (q) => q.from({ t: toolCalls }).where(({ t }) => eq(t.threadId, threadId)),
    [threadId],
  )
  const timeline = buildTimeline({
    msgs: msgs as Array<MessageRow>,
    tools: tools as Array<ToolCallRow>,
  })

  const send = async (text: string) => {
    const t = text.trim()
    if (!t) return
    setInput('')
    await sendPrompt(threadId, t, HARNESS)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-6">
        <span className="font-medium">Meta-chat</span>
        <span className="font-mono text-xs text-ink-3">dashboard/meta</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-7 px-6 py-5">
          {timeline.length === 0 ? (
            <div className="space-y-4 py-10 text-center">
              <p className="text-[15px] text-ink-2">
                The dashboard's own agent. It uses tools over live state, and
                every tool call shows up here and in History.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {QUICK.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="btn btn-sm btn-outline rounded-full font-normal"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <Stream entries={timeline} />
          )}
        </div>
      </div>
      <div className="mx-auto w-full max-w-[720px] px-6 pt-3 pb-5">
        <Composer
          value={input}
          onChange={setInput}
          onSend={() => send(input)}
          placeholder="Ask the dashboard…"
          solo
        />
      </div>
    </div>
  )
}
