import { createFileRoute } from '@tanstack/react-router'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useEffect, useState } from 'react'
import { CoinsIcon, PlayIcon } from '@phosphor-icons/react'
import {
  approvals,
  messages,
  questions,
  sessions,
  spend,
  toolCalls,
} from '@/db/collections'
import {
  controlInput,
  hydrateSession,
  sendPrompt,
} from '@/lib/session-controller'
import {
  Composer,
  StatusPill,
  Stream,
  buildTimeline,
} from '@/components/stream'
import type {
  ApprovalRow,
  MessageRow,
  QuestionRow,
  SessionRow,
  ToolCallRow,
} from '@/db/collections'

export const Route = createFileRoute('/sessions/$threadId')({
  component: SessionDetail,
})

function SessionDetail() {
  const { threadId } = Route.useParams()
  const [input, setInput] = useState('')

  useEffect(() => {
    void hydrateSession(threadId)
  }, [threadId])

  const { data: msgs = [] } = useLiveQuery(
    (q) => q.from({ m: messages }).where(({ m }) => eq(m.threadId, threadId)),
    [threadId],
  )
  const { data: tools = [] } = useLiveQuery(
    (q) => q.from({ t: toolCalls }).where(({ t }) => eq(t.threadId, threadId)),
    [threadId],
  )
  const { data: apprs = [] } = useLiveQuery(
    (q) => q.from({ a: approvals }).where(({ a }) => eq(a.threadId, threadId)),
    [threadId],
  )
  const { data: questionRows = [] } = useLiveQuery(
    (query) =>
      query
        .from({ question: questions })
        .where(({ question }) => eq(question.threadId, threadId)),
    [threadId],
  )
  const { data: spendRows = [] } = useLiveQuery(
    (q) => q.from({ s: spend }).where(({ s }) => eq(s.threadId, threadId)),
    [threadId],
  )
  const { data: sess = [] } = useLiveQuery(
    (q) => q.from({ s: sessions }).where(({ s }) => eq(s.threadId, threadId)),
    [threadId],
  )

  const status = (sess as Array<SessionRow>)[0]?.status ?? 'idle'
  const tokens =
    (spendRows as Array<{ totalTokens: number }>)[0]?.totalTokens ?? 0
  const timeline = buildTimeline({
    msgs: msgs as Array<MessageRow>,
    tools: tools as Array<ToolCallRow>,
    approvals: apprs as Array<ApprovalRow>,
    questions: questionRows as Array<QuestionRow>,
  })

  const send = async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    if (status === 'running') {
      await controlInput(threadId, { op: 'steer', message: text })
      return
    }
    await sendPrompt(threadId, text)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-6">
        <span className="font-mono text-[13px] font-normal">{threadId}</span>
        <StatusPill status={status} />
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-normal text-ink-3">
          <CoinsIcon size={14} />
          {tokens.toLocaleString()} tokens
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-7 px-6 py-5">
          {timeline.length === 0 ? (
            <p className="py-10 text-center text-ink-3">
              No activity yet. Send a prompt or start the triage demo below.
            </p>
          ) : (
            <Stream entries={timeline} />
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[720px] px-6 pt-3 pb-5">
        <Composer
          value={input}
          onChange={setInput}
          onSend={send}
          running={status === 'running'}
          onStop={() => controlInput(threadId, { op: 'cancel' })}
          solo
        >
          <button
            onClick={() =>
              sendPrompt(threadId, 'Please handle ticket T-1042 for Ada.')
            }
            className="btn btn-sm btn-outline"
          >
            <PlayIcon size={12} />
            Start triage demo
          </button>
        </Composer>
      </div>
    </div>
  )
}
