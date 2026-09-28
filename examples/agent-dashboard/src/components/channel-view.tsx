/**
 * The shared channel view. It unions every member thread of a channel into one
 * timeline (a live query over the collections keyed by `channelId`). With one
 * member it looks exactly like a single-agent chat; when a second member joins,
 * team chrome (the member list, per-agent attribution) appears — the "second
 * agent reveals the team" moment.
 *
 * A channel's members are its team roster for the `main` channel, or the opt-in
 * `channelMembers` for a `dynamic`/`dm` channel. Attribution is resolved against
 * the whole team roster either way.
 */
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  approvals,
  channelMembers,
  channels,
  memberships,
  messages,
  runMeta,
  sessions,
  spend,
  toolCalls,
  uiState,
  upsert,
} from '@/db/collections'
import {
  addAgentToChannel,
  channelSendPrompt,
  createDm,
  defaultSubscriptions,
  openChannelMember,
  resolveApproval,
} from '@/lib/session-controller'
import { MemberList } from '@/components/member-list'
import { MemoryPanel } from '@/components/memory-panel'
import { JsonTree, tryParse } from '@/components/json-tree'
import { Markdown } from '@/components/markdown'
import type {
  ApprovalRow,
  ChannelMemberRow,
  ChannelRow,
  MembershipRow,
  MessageRow,
  RunMetaRow,
  SessionRow,
  ToolCallRow,
  UiStateRow,
} from '@/db/collections'

// `pod.channel_create` / `pod.message_post` are realized as a channel and a
// message respectively, so their raw tool cards are hidden (they'd duplicate).
// `pod.memory_write` stays visible (the write is auditable mechanics).
const HIDDEN_TOOL_CARDS = new Set([
  'pod.channel_create',
  'pod.message_post',
  'pod.memory_read',
])

export function ChannelView({
  channelId,
  teamId,
}: {
  channelId: string
  teamId?: string
}) {
  const [input, setInput] = useState('')

  const { data: chanRows = [] } = useLiveQuery(
    (q) => q.from({ c: channels }).where(({ c }) => eq(c.id, channelId)),
    [channelId],
  )
  const channel = (chanRows as Array<ChannelRow>)[0]
  const resolvedTeamId = teamId ?? channel?.teamId

  // The whole team roster (for attribution + main-channel membership).
  const { data: roster = [] } = useLiveQuery(
    (q) =>
      q
        .from({ m: memberships })
        .where(({ m }) => eq(m.teamId, resolvedTeamId ?? '')),
    [resolvedTeamId],
  )
  const rosterRows = roster as Array<MembershipRow>
  // Opt-in members for a non-main channel.
  const { data: chanMembers = [] } = useLiveQuery(
    (q) =>
      q
        .from({ cm: channelMembers })
        .where(({ cm }) => eq(cm.channelId, channelId)),
    [channelId],
  )
  const chanMemberRows = chanMembers as Array<ChannelMemberRow>

  const isMain = channel?.kind !== 'dynamic' && channel?.kind !== 'dm'
  const memberRows: Array<MembershipRow> = isMain
    ? rosterRows
    : chanMemberRows
        .map((cm) => rosterRows.find((m) => m.agentId === cm.agentId))
        .filter((m): m is MembershipRow => Boolean(m))

  // Open a live tail for every team member so background runs (a watcher firing,
  // a subscribed agent reviewing) project even when we're not looking at them.
  const rosterKey = rosterRows.map((m) => m.id).join(',')
  useEffect(() => {
    for (const m of rosterRows) {
      openChannelMember({
        channelId: m.channelId,
        agentId: m.agentId,
        threadId: m.threadId,
        teamId: m.teamId,
        harness: m.harness,
        role: m.role,
        displayName: m.displayName,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterKey])

  // Publish the active channel so the demo-controls devtools panel (rendered
  // out of the route tree) knows which channel to drive. Clear on unmount
  // unless another channel already took over.
  useEffect(() => {
    upsert<UiStateRow>(uiState, { id: 'active' }, (d) => {
      d.channelId = channelId
      d.teamId = resolvedTeamId
    })
    return () => {
      if (uiState.get('active')?.channelId === channelId) {
        upsert<UiStateRow>(uiState, { id: 'active' }, (d) => {
          d.channelId = undefined
          d.teamId = undefined
        })
      }
    }
  }, [channelId, resolvedTeamId])

  const { data: msgs = [] } = useLiveQuery(
    (q) => q.from({ m: messages }).where(({ m }) => eq(m.channelId, channelId)),
    [channelId],
  )
  const { data: tools = [] } = useLiveQuery(
    (q) =>
      q.from({ t: toolCalls }).where(({ t }) => eq(t.channelId, channelId)),
    [channelId],
  )
  const { data: apprs = [] } = useLiveQuery(
    (q) =>
      q.from({ a: approvals }).where(({ a }) => eq(a.channelId, channelId)),
    [channelId],
  )
  const { data: spendRows = [] } = useLiveQuery(
    (q) => q.from({ s: spend }).where(({ s }) => eq(s.channelId, channelId)),
    [channelId],
  )
  const { data: sess = [] } = useLiveQuery(
    (q) => q.from({ s: sessions }).where(({ s }) => eq(s.channelId, channelId)),
    [channelId],
  )
  const { data: runMetaRows = [] } = useLiveQuery((q) => q.from({ r: runMeta }))

  const isTeam = memberRows.length > 1
  const nameByAgent = new Map(rosterRows.map((m) => [m.agentId, m.displayName]))
  const statusByThread: Record<string, SessionRow['status']> = {}
  for (const s of sess as Array<SessionRow>)
    statusByThread[s.threadId] = s.status

  const sessionRows = sess as Array<SessionRow>
  const status = sessionRows.some((s) => s.status === 'requires_action')
    ? 'requires_action'
    : sessionRows.some((s) => s.status === 'running')
      ? 'running'
      : 'idle'
  const tokens = (spendRows as Array<{ totalTokens: number }>).reduce(
    (sum, s) => sum + (s.totalTokens ?? 0),
    0,
  )
  const pending = (apprs as Array<ApprovalRow>).filter(
    (a) => a.status === 'pending',
  )

  const timeline = [
    ...(msgs as Array<MessageRow>).map((m) => ({
      kind: 'message' as const,
      at: m.createdAt,
      m,
    })),
    ...(tools as Array<ToolCallRow>)
      .filter((t) => !HIDDEN_TOOL_CARDS.has(t.name))
      .map((t) => ({ kind: 'tool' as const, at: t.createdAt, t })),
  ].sort((a, b) => a.at - b.at)

  // Human input targets the primary agent member (broadcast is a later phase).
  const primary =
    memberRows.find((m) => m.role === 'agent') ?? memberRows[0] ?? undefined

  // How much pod memory the platform attached to this channel's agents' last run.
  const attachedById = new Map(
    (runMetaRows as Array<RunMetaRow>).map((r) => [r.threadId, r.attached]),
  )
  const attached = primary ? (attachedById.get(primary.threadId) ?? 0) : 0

  const send = async (text: string) => {
    const t = text.trim()
    if (!t || !primary) return
    setInput('')
    await channelSendPrompt(primary, t, channelId)
  }

  // A generic nudge to run a specific member. (The triage-specific demo prompt
  // lives in the Demo Controls panel, not here — this must work for any agent.)
  const runMember = (member: MembershipRow) =>
    channelSendPrompt(member, 'Please proceed.', channelId)

  const createDmWith = (member: MembershipRow) => {
    if (!primary || member.agentId === primary.agentId) return
    void createDm(
      {
        channelId: primary.channelId,
        agentId: primary.agentId,
        threadId: primary.threadId,
        teamId: primary.teamId,
        harness: primary.harness,
        role: primary.role,
        displayName: primary.displayName,
      },
      member.agentId,
      member.displayName,
    )
  }

  // Toggle a member's subscription on/off. "On" restores the harness's default
  // triggers (what it reacts to) rather than a hardcoded channel_created one.
  const toggleSubscription = (member: MembershipRow) => {
    const on = (member.subscriptions ?? []).length > 0
    memberships.update(member.id, (draft) => {
      draft.subscriptions = on
        ? []
        : (defaultSubscriptions(member.harness) ?? [])
    })
  }

  const title = isMain
    ? isTeam
      ? 'main'
      : (primary?.displayName ?? channel?.name ?? channelId)
    : `#${channel?.name ?? channelId}`

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <a href="/" className="text-xs text-white/40 hover:text-white/70">
          ← teams
        </a>
        <h1 className="font-mono text-sm">{title}</h1>
        {channel?.topic && (
          <span className="text-xs text-white/40">{channel.topic}</span>
        )}
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
        {attached > 0 && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200">
            🧠 {attached} memory {attached === 1 ? 'entry' : 'entries'} attached
          </span>
        )}
        <span className="ml-auto text-xs text-white/40">
          {tokens.toLocaleString()} tokens
        </span>
        {isMain && <AddAgentControl channelId={channelId} />}
      </div>

      {pending.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          tool={(tools as Array<ToolCallRow>).find(
            (t) => t.id === approval.toolCallId,
          )}
        />
      ))}

      <div className="flex gap-4">
        {isTeam && (
          <MemberList
            members={memberRows}
            statusByThread={statusByThread}
            onRun={runMember}
            onCreateDm={createDmWith}
            onToggleSubscription={toggleSubscription}
          />
        )}
        <div className="flex-1 space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
          {timeline.length === 0 && (
            <p className="text-sm text-white/40">
              No activity yet. Send a message below, or drive it from the Demo
              controls devtools panel.
            </p>
          )}
          {timeline.map((entry) =>
            entry.kind === 'message' ? (
              entry.m.role === 'system' ? (
                <SystemCard key={entry.m.id} message={entry.m} />
              ) : (
                <MessageBubble
                  key={entry.m.id}
                  message={entry.m}
                  author={
                    entry.m.agentId
                      ? nameByAgent.get(entry.m.agentId)
                      : undefined
                  }
                  showAuthor={isTeam}
                />
              )
            ) : (
              <ToolCard
                key={entry.t.id}
                tool={entry.t}
                author={
                  entry.t.agentId ? nameByAgent.get(entry.t.agentId) : undefined
                }
                showAuthor={isTeam}
              />
            ),
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(input)}
          placeholder="Send a message…"
          className="min-w-40 flex-1 rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-white/30"
        />
        <button
          onClick={() => send(input)}
          className="rounded-md bg-emerald-500/90 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400"
        >
          Send
        </button>
      </div>

      {isTeam && isMain && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">
            Memory
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {memberRows
              .filter((m) => m.role === 'agent')
              .map((m) => (
                <MemoryPanel
                  key={m.id}
                  threadId={m.threadId}
                  name={m.displayName}
                />
              ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** Add any available agent to this team (product control, main channel only). */
function AddAgentControl({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false)
  const hosts = useQuery<
    Array<{ agents: Array<{ name: string; description: string }> }>
  >({
    queryKey: ['hosts'],
    queryFn: () => fetch('/api/hosts').then((r) => r.json()),
  })
  const agents = (hosts.data ?? []).flatMap((h) => h.agents)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-white/15 px-2 py-0.5 text-xs text-white/70 hover:bg-white/[0.05]"
      >
        ＋ Add agent
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 max-h-64 w-72 space-y-0.5 overflow-auto rounded-md border border-white/15 bg-neutral-900 p-1 shadow-lg">
          {agents.map((a) => (
            <button
              key={a.name}
              onClick={() => {
                addAgentToChannel(channelId, a.name)
                setOpen(false)
              }}
              className="block w-full rounded px-2 py-1 text-left hover:bg-white/[0.06]"
              title={a.description}
            >
              <span className="font-mono text-xs text-sky-300">{a.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AuthorTag({ author }: { author?: string }) {
  if (!author) return null
  return (
    <span className="mr-1 rounded bg-white/10 px-1 text-[10px] text-white/60">
      {author}
    </span>
  )
}

function SystemCard({ message }: { message: MessageRow }) {
  const icon = message.system?.kind === 'channel_created' ? '📢' : '👋'
  return (
    <div className="rounded-md border border-sky-500/30 bg-sky-500/[0.05] px-3 py-1.5 text-xs text-sky-200/80">
      <span className="mr-1">{icon}</span>
      {message.text}
      {message.system?.topic && (
        <span className="ml-1 text-white/40">— {message.system.topic}</span>
      )}
    </div>
  )
}

function MessageBubble({
  message,
  author,
  showAuthor,
}: {
  message: MessageRow
  author?: string
  showAuthor: boolean
}) {
  const isUser = message.role === 'user'
  const [expanded, setExpanded] = useState(false)
  // Strip the internal `[channel:<id>]` routing tag the injector prefixes onto a
  // subscription prompt — it's plumbing, not something a human should read.
  const text = message.text.replace(/^\[channel:[^\]]+\]\s*/, '')
  // Injected trigger prompts (a subscription's "New … batch" context) arrive as
  // long user messages. Collapse them to a few lines so they don't drown the
  // channel; a human's own message is short and never trips this.
  const long = isUser && text.length > 280
  return (
    <div className={isUser ? 'text-right' : ''}>
      <div
        className={`inline-block max-w-[80%] rounded-lg px-3 py-2 text-left text-sm ${
          isUser ? 'bg-emerald-500/15 text-emerald-100' : 'bg-white/[0.06]'
        }`}
      >
        {showAuthor && !isUser && <AuthorTag author={author} />}
        {message.subagentRunId && (
          <span className="mr-1 rounded bg-fuchsia-500/20 px-1 text-[10px] text-fuchsia-300">
            subagent
          </span>
        )}
        {text ? (
          isUser ? (
            <>
              <div
                className={
                  long && !expanded
                    ? 'line-clamp-3 whitespace-pre-wrap'
                    : 'whitespace-pre-wrap'
                }
              >
                {text}
              </div>
              {long && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-1 text-[11px] text-emerald-300/70 hover:text-emerald-200"
                >
                  {expanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </>
          ) : (
            <Markdown>{text}</Markdown>
          )
        ) : (
          <span className="text-white/30">…</span>
        )}
      </div>
    </div>
  )
}

function ToolCard({
  tool,
  author,
  showAuthor,
}: {
  tool: ToolCallRow
  author?: string
  showAuthor: boolean
}) {
  // Injected tool calls (timer/manual/webhook) get a distinct border + badge.
  const injected = Boolean(tool.trigger)
  return (
    <div
      className={`rounded-md border p-2 font-mono text-xs ${
        injected
          ? 'border-violet-500/40 bg-violet-500/[0.06]'
          : 'border-white/10 bg-black/20'
      }`}
    >
      <div className="flex items-center gap-2">
        {showAuthor && <AuthorTag author={author} />}
        {injected && (
          <span className="rounded bg-violet-500/20 px-1 text-[10px] text-violet-300">
            ⏵ {tool.trigger}
          </span>
        )}
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
      {tool.args &&
        (() => {
          const parsed = tryParse(tool.args)
          return parsed !== undefined ? (
            <div className="mt-1">
              <JsonTree value={parsed} />
            </div>
          ) : (
            <div className="mt-1 text-white/50">{tool.args}</div>
          )
        })()}
      {tool.result &&
        (() => {
          const parsed = tryParse(tool.result)
          return parsed !== undefined ? (
            <div className="mt-1">
              <JsonTree value={parsed} />
            </div>
          ) : (
            <div className="mt-1 text-emerald-200/70">→ {tool.result}</div>
          )
        })()}
      {tool.truncated && (
        <div className="mt-1 text-white/30">(result truncated)</div>
      )}
    </div>
  )
}

function ApprovalCard({
  approval,
  tool,
}: {
  approval: ApprovalRow
  tool?: ToolCallRow
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
    await resolveApproval(approval.threadId, approval.id, decision, editedArgs)
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
