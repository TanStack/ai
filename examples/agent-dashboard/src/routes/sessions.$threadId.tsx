import { createFileRoute } from '@tanstack/react-router'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useEffect, useState } from 'react'
import {
  approvals,
  messages,
  sessions,
  spend,
  toolCalls,
} from '@/db/collections'
import {
  hydrateSession,
  resolveApproval,
  sendPrompt,
} from '@/lib/session-controller'
import type { ApprovalRow, MessageRow, ToolCallRow } from '@/db/collections'

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
  const { data: spendRows = [] } = useLiveQuery(
    (q) => q.from({ s: spend }).where(({ s }) => eq(s.threadId, threadId)),
    [threadId],
  )
  const { data: sess = [] } = useLiveQuery(
    (q) => q.from({ s: sessions }).where(({ s }) => eq(s.threadId, threadId)),
    [threadId],
  )

  const status = (sess as Array<{ status: string }>)[0]?.status ?? 'idle'
  const tokens =
    (spendRows as Array<{ totalTokens: number }>)[0]?.totalTokens ?? 0
  const pending = (apprs as Array<ApprovalRow>).filter(
    (a) => a.status === 'pending',
  )

  const timeline = [
    ...(msgs as Array<MessageRow>).map((m) => ({
      kind: 'message' as const,
      at: m.createdAt,
      m,
    })),
    ...(tools as Array<ToolCallRow>).map((t) => ({
      kind: 'tool' as const,
      at: t.createdAt,
      t,
    })),
  ].sort((a, b) => a.at - b.at)

  const send = async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    await sendPrompt(threadId, text)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <a href="/" className="text-xs text-white/40 hover:text-white/70">
          ← hosts
        </a>
        <h1 className="font-mono text-sm">{threadId}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            status === 'running'
              ? 'bg-sky-500/20 text-sky-300'
              : status === 'requires_action'
                ? 'bg-amber-500/20 text-amber-300'
                : 'bg-white/10 text-white/60'
          }`}
        >
          {status.replace('_', ' ')}
        </span>
        <span className="ml-auto text-xs text-white/40">
          {tokens.toLocaleString()} tokens
        </span>
      </div>

      {pending.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          tool={(tools as Array<ToolCallRow>).find(
            (t) => t.id === approval.toolCallId,
          )}
          threadId={threadId}
        />
      ))}

      <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
        {timeline.length === 0 && (
          <p className="text-sm text-white/40">
            No activity yet. Send a prompt or start the triage demo below.
          </p>
        )}
        {timeline.map((entry) =>
          entry.kind === 'message' ? (
            <MessageBubble key={entry.m.id} message={entry.m} />
          ) : (
            <ToolCard key={entry.t.id} tool={entry.t} />
          ),
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() =>
            sendPrompt(threadId, 'Please handle ticket T-1042 for Ada.')
          }
          className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.05]"
        >
          ▶ Start triage demo
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Send a message…"
          className="flex-1 rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-white/30"
        />
        <button
          onClick={send}
          className="rounded-md bg-emerald-500/90 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400"
        >
          Send
        </button>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: MessageRow }) {
  const isUser = message.role === 'user'
  return (
    <div className={isUser ? 'text-right' : ''}>
      <div
        className={`inline-block max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          isUser ? 'bg-emerald-500/15 text-emerald-100' : 'bg-white/[0.06]'
        }`}
      >
        {message.subagentRunId && (
          <span className="mr-1 rounded bg-fuchsia-500/20 px-1 text-[10px] text-fuchsia-300">
            subagent
          </span>
        )}
        {message.text || <span className="text-white/30">…</span>}
      </div>
    </div>
  )
}

function ToolCard({ tool }: { tool: ToolCallRow }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-2 font-mono text-xs">
      <div className="flex items-center gap-2">
        <span className="text-sky-300">⚙ {tool.name}</span>
        <span
          className={`ml-auto rounded px-1.5 text-[10px] ${
            tool.status === 'done'
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-white/10 text-white/50'
          }`}
        >
          {tool.status}
        </span>
      </div>
      {tool.args && <div className="mt-1 text-white/50">{tool.args}</div>}
      {tool.result && (
        <div className="mt-1 text-emerald-200/70">→ {tool.result}</div>
      )}
    </div>
  )
}

function ApprovalCard({
  approval,
  tool,
  threadId,
}: {
  approval: ApprovalRow
  tool?: ToolCallRow
  threadId: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(tool?.args ?? '{}')
  const [busy, setBusy] = useState(false)

  const act = async (decision: 'approve' | 'deny', edited?: boolean) => {
    setBusy(true)
    let editedArgs: Record<string, unknown> | undefined
    if (edited) {
      try {
        editedArgs = JSON.parse(draft)
      } catch {
        setBusy(false)
        return
      }
    }
    await resolveApproval(threadId, approval.id, decision, editedArgs)
    setBusy(false)
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🔔</span>
        <span className="font-medium text-amber-200">Approval required</span>
        {tool && (
          <span className="ml-auto font-mono text-xs text-amber-200/70">
            {tool.name}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-amber-100/80">{approval.message}</p>
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 p-2 font-mono text-xs outline-none"
        />
      ) : (
        tool?.args && (
          <pre className="mt-2 overflow-x-auto rounded-md bg-black/30 p-2 font-mono text-xs text-white/60">
            {tool.args}
          </pre>
        )
      )}
      <div className="mt-3 flex gap-2">
        <button
          disabled={busy}
          onClick={() => act('approve', editing)}
          className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-sm font-medium text-black hover:bg-emerald-400 disabled:opacity-50"
        >
          {editing ? 'Approve edited' : 'Approve'}
        </button>
        <button
          disabled={busy}
          onClick={() => act('deny')}
          className="rounded-md bg-rose-500/80 px-3 py-1.5 text-sm font-medium text-black hover:bg-rose-400 disabled:opacity-50"
        >
          Deny
        </button>
        <button
          disabled={busy}
          onClick={() => setEditing((v) => !v)}
          className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/70 hover:bg-white/[0.05]"
        >
          {editing ? 'Cancel edit' : 'Edit'}
        </button>
        <span className="ml-auto self-center text-[10px] text-white/30">
          approve → AG-UI resume · deny → harness protocol
        </span>
      </div>
    </div>
  )
}
