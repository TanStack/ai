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
import { CoinsIcon, DatabaseIcon, UserPlusIcon } from '@phosphor-icons/react'
import {
  DEFAULT_BUDGET,
  approvals,
  budgets,
  channelMembers,
  channels,
  memberships,
  messages,
  questions,
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
  controlInput,
  createDm,
  defaultSubscriptions,
  openChannelMember,
} from '@/lib/session-controller'
import { MemberList } from '@/components/member-list'
import { MemoryPanel } from '@/components/memory-panel'
import {
  Composer,
  StatusPill,
  Stream,
  buildTimeline,
} from '@/components/stream'
import { compact } from '@/components/ui'
import { TraceWaterfall } from '@/components/trace-waterfall'
import { TeamAutomations } from '@/components/team-automations'
import { costUsd } from '@/lib/pricing'
import type {
  ApprovalRow,
  BudgetRow,
  ChannelMemberRow,
  ChannelRow,
  MembershipRow,
  MessageRow,
  QuestionRow,
  RunMetaRow,
  SessionRow,
  SpendRow,
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
  const [view, setView] = useState<'timeline' | 'trace'>('timeline')

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
  const { data: questionRows = [] } = useLiveQuery(
    (query) =>
      query
        .from({ question: questions })
        .where(({ question }) => eq(question.channelId, channelId)),
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
  const { data: budgetRows = [] } = useLiveQuery((q) => q.from({ b: budgets }))

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
  const dollars = (spendRows as Array<SpendRow>).reduce((sum, row) => {
    const member = rosterRows.find((item) => item.threadId === row.threadId)
    return sum + costUsd(member?.harness, row.inputTokens, row.outputTokens)
  }, 0)
  const timeline = buildTimeline({
    msgs: msgs as Array<MessageRow>,
    tools: (tools as Array<ToolCallRow>).filter(
      (t) => !HIDDEN_TOOL_CARDS.has(t.name),
    ),
    approvals: apprs as Array<ApprovalRow>,
    questions: questionRows as Array<QuestionRow>,
  })

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
    if (status === 'running') {
      await controlInput(primary.threadId, { op: 'steer', message: t })
      return
    }
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

  const budget = memberRows.reduce(
    (sum, m) =>
      sum +
      ((budgetRows as Array<BudgetRow>).find((b) => b.threadId === m.threadId)
        ?.maxTokens ?? DEFAULT_BUDGET),
    0,
  )

  const sigil = channel?.kind === 'dm' ? '@' : '#'
  const title =
    isMain && !isTeam
      ? (primary?.displayName ?? channel?.name ?? channelId)
      : isMain
        ? 'main'
        : (channel?.name ?? channelId)
  const column = isTeam ? 'px-6' : 'mx-auto w-full max-w-[720px] px-6'

  return (
    <div className="flex h-full">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-line px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-[17px] font-bold">
                {(isTeam || !isMain) && (
                  <span className="text-ink-3">{sigil} </span>
                )}
                {title}
              </h1>
              {!isMain && (
                <span className="pill border border-line-strong font-normal text-ink-2">
                  {channel?.kind}
                </span>
              )}
              <StatusPill status={status} />
            </div>
            {channel?.topic && (
              <div className="truncate text-xs font-normal text-ink-3">
                {channel.topic}
              </div>
            )}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {attached > 0 && (
              <span className={CHIP}>
                <DatabaseIcon size={14} />
                {attached} memory {attached === 1 ? 'entry' : 'entries'}{' '}
                attached
              </span>
            )}
            <span className={CHIP}>
              <CoinsIcon size={14} />${dollars.toFixed(4)} ·{' '}
              {tokens.toLocaleString()} tokens
            </span>
            <span className="flex rounded-sm bg-ui p-0.5 text-xs font-normal">
              {(['timeline', 'trace'] as const).map((item) => (
                <button
                  key={item}
                  onClick={() => setView(item)}
                  className={`rounded-[4px] px-2 py-0.5 ${
                    view === item ? 'bg-surface text-ink' : 'text-ink-3'
                  }`}
                >
                  {item}
                </button>
              ))}
            </span>
            {isMain && <AddAgentControl channelId={channelId} />}
          </div>
        </header>

        {/* column-reverse keeps the stream bottom-anchored, like chat. */}
        <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto">
          <div className={`flex flex-col gap-3.5 py-5 ${column}`}>
            {view === 'trace' ? (
              <TraceWaterfall channelId={channelId} />
            ) : timeline.length === 0 ? (
              <p className="py-10 text-center text-ink-3">
                No activity yet. Send a message below, or drive it from the Demo
                controls devtools panel.
              </p>
            ) : (
              <Stream
                entries={timeline}
                team={isTeam}
                nameByAgent={nameByAgent}
              />
            )}
          </div>
        </div>

        <div className={`pt-3 pb-5 ${column}`}>
          <Composer
            value={input}
            onChange={setInput}
            onSend={() => send(input)}
            running={status === 'running' && Boolean(primary)}
            onStop={() =>
              primary && controlInput(primary.threadId, { op: 'cancel' })
            }
            solo={!isTeam}
          />
        </div>
      </section>

      <aside className="w-[300px] shrink-0 space-y-6 overflow-y-auto border-l border-line px-4 py-[18px]">
        {isTeam && (
          <MemberList
            members={memberRows}
            statusByThread={statusByThread}
            onRun={runMember}
            onCreateDm={createDmWith}
            onToggleSubscription={toggleSubscription}
          />
        )}

        <section className="space-y-2">
          <h2 className="label">Spend boundary</h2>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-[22px] font-bold">
              {compact(tokens)}
            </span>
            <span className="text-xs font-normal text-ink-3">
              of {compact(budget)} tok
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-line-strong">
            <div
              className={`h-full ${tokens > budget * 0.8 ? 'bg-warn' : 'bg-ink-2'}`}
              style={{ width: `${Math.min((tokens / budget) * 100, 100)}%` }}
            />
          </div>
        </section>

        {isTeam && isMain && (
          <section className="space-y-3">
            {memberRows
              .filter((m) => m.role === 'agent')
              .map((m) => (
                <MemoryPanel
                  key={m.id}
                  threadId={m.threadId}
                  name={m.displayName}
                />
              ))}
          </section>
        )}

        {isMain && (
          <TeamAutomations channelId={channelId} members={memberRows} />
        )}
      </aside>
    </div>
  )
}

const CHIP =
  'inline-flex items-center gap-1.5 rounded-full bg-ui px-2.5 py-1 text-xs font-normal text-ink-2'

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
        className="btn btn-sm btn-outline"
      >
        <UserPlusIcon size={14} />
        Add agent
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 max-h-72 w-72 overflow-auto rounded-md border border-line bg-ui p-1 shadow-2">
          {agents.map((a) => (
            <button
              key={a.name}
              onClick={() => {
                addAgentToChannel(channelId, a.name)
                setOpen(false)
              }}
              className="block w-full rounded-sm px-2 py-1.5 text-left font-mono text-xs hover:bg-ui-hover"
              title={a.description}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
