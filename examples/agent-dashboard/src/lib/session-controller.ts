/**
 * The live session controller. One `@ag-ui/client` HttpAgent per member thread,
 * whose AG-UI events are projected into TanStack DB collections. The UI is then a
 * live query over those collections — a projection of the event stream, not a
 * poller.
 *
 * A *channel* unions N member threads into one shared view. Each member keeps its
 * own server-side AG-UI thread (so no harness change is needed to make agents
 * share a chat); the channel is the view that merges them. To keep two members'
 * streams from colliding, every projected row id is namespaced by the member's
 * `agentId` (which equals the member's `threadId` today).
 */
import { HttpAgent } from '@ag-ui/client'
import {
  approvals,
  channelMembers,
  channels,
  memberships,
  messages,
  runMeta,
  sessions,
  spend,
  teams,
  toolCalls,
  upsert,
} from '@/db/collections'
import type {
  ChannelMemberRow,
  ChannelRow,
  MembershipRow,
  Subscription,
  TeamRow,
} from '@/db/collections'

export type MemberRole = 'agent' | 'operator'

export interface Member {
  channelId: string
  /** Unique per member; equals `threadId` in Phase 1. */
  agentId: string
  threadId: string
  teamId?: string
  harness: string
  role: MemberRole
  displayName: string
}

interface Entry {
  agent: HttpAgent
  subscribed: boolean
}
const registry = new Map<string, Entry>()
/** The member behind each thread, so approvals can find the right endpoint. */
const membersByThread = new Map<string, Member>()

function origin() {
  return typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost'
}

/* ------------------------------------------------------------------ */
/* Roster persistence                                                  */
/*                                                                     */
/* The team roster lives in localOnly collections. These two functions */
/* back it with the server so a team created in one session reappears  */
/* after a reload or a server restart (see src/server/store.ts).       */
/* ------------------------------------------------------------------ */

let rosterTimer: ReturnType<typeof setTimeout> | undefined
/** Save the roster to the server, debounced so a burst of writes is one POST. */
function persistRoster(): void {
  if (typeof window === 'undefined' || rosterTimer) return
  rosterTimer = setTimeout(() => {
    rosterTimer = undefined
    void fetch(`${origin()}/api/roster`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        teams: teams.toArray,
        channels: channels.toArray,
        memberships: memberships.toArray,
        channelMembers: channelMembers.toArray,
      }),
    }).catch(() => {})
  }, 150)
}

let rosterHydrated = false
/** Seed the roster collections from the server once, on app load. */
export async function hydrateRoster(): Promise<void> {
  if (rosterHydrated || typeof window === 'undefined') return
  rosterHydrated = true
  try {
    const res = await fetch(`${origin()}/api/roster`)
    if (!res.ok) return
    const data = (await res.json()) as {
      teams?: Array<TeamRow>
      channels?: Array<ChannelRow>
      memberships?: Array<MembershipRow>
      channelMembers?: Array<ChannelMemberRow>
    }
    for (const row of data.teams ?? []) upsert(teams, row)
    for (const row of data.channels ?? []) upsert(channels, row)
    for (const row of data.memberships ?? []) upsert(memberships, row)
    for (const row of data.channelMembers ?? []) upsert(channelMembers, row)
  } catch {
    // best-effort: a missing roster just means no teams yet
  }
}

/** Which run endpoint a harness streams over. */
export function endpointFor(harness: string): string {
  return harness === 'dashboard/meta' ? '/api/meta' : '/api/agent'
}

function shortName(harness: string): string {
  return harness.split('/').pop() ?? harness
}

/**
 * Derive the implicit single-member channel for a back-compat route
 * (`/sessions/$threadId`, `/chat`). agentId === threadId, so id namespacing is
 * per-thread and the existing threadId-keyed queries keep working unchanged.
 */
function memberFromThread(threadId: string, endpoint: string): Member {
  const harness = endpoint === '/api/meta' ? 'dashboard/meta' : 'support/triage'
  return {
    channelId: `channel-${threadId}`,
    agentId: threadId,
    threadId,
    harness,
    role: endpoint === '/api/meta' ? 'operator' : 'agent',
    displayName: shortName(harness),
  }
}

interface Ctx {
  threadId: string
  channelId: string
  agentId: string
  /**
   * True when events arrive from the raw feed tail (channel view) rather than a
   * coalesced AG-UI run (back-compat routes). The raw feed carries per-turn
   * usage on RUN_FINISHED but no `tanstack.spend` ticks, so spend is summed from
   * RUN_FINISHED here; the back-compat path keeps using the spend ticks.
   */
  viaTail?: boolean
}

/** Cap a projected tool result so a large payload can't bloat the live view. */
const MAX_RESULT_CHARS = 64 * 1024
function clampResult(value: unknown): { text: string; truncated: boolean } {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text.length > MAX_RESULT_CHARS) {
    return { text: `${text.slice(0, MAX_RESULT_CHARS)}…`, truncated: true }
  }
  return { text, truncated: false }
}

function setStatus(ctx: Ctx, status: 'idle' | 'running' | 'requires_action') {
  upsert(
    sessions,
    {
      id: ctx.threadId,
      threadId: ctx.threadId,
      channelId: ctx.channelId,
      agentId: ctx.agentId,
      status,
      createdAt: Date.now(),
    },
    (draft) => {
      draft.status = status
      draft.channelId = ctx.channelId
      draft.agentId = ctx.agentId
    },
  )
}

/**
 * The channel a member is currently active in. A member owns one thread but can
 * be engaged in several channels over time (main, then a PR channel). Setting
 * this routes the member's incidental events (text, tool cards, memory writes)
 * into the channel it's working in. `pod.message_post`/`pod.channel_create`
 * results still route by their explicit target channel, independent of this.
 */
const activeChannelByThread = new Map<string, string>()
export function setActiveChannel(threadId: string, channelId: string): void {
  activeChannelByThread.set(threadId, channelId)
}

/** Project one AG-UI event into the collections, namespaced to a member. */
function project(ctx: Ctx, event: any, replay = false) {
  const { threadId, agentId } = ctx
  // A synthesized history event (see /api/tail rehydration) carries the channel
  // its message belonged to, so a rebuilt timeline routes DM vs main correctly.
  const channelId =
    event.channelId ?? activeChannelByThread.get(threadId) ?? ctx.channelId
  const nsKey = (raw: string) => `${agentId}:${raw}`
  switch (event.type) {
    case 'RUN_STARTED':
      setStatus(ctx, 'running')
      break
    case 'TEXT_MESSAGE_START':
      upsert(messages, {
        id: nsKey(event.messageId),
        threadId,
        channelId,
        agentId,
        role: event.role === 'user' ? 'user' : 'assistant',
        text: '',
        ...(event.subagentRunId ? { subagentRunId: event.subagentRunId } : {}),
        createdAt: Date.now(),
      })
      break
    case 'TEXT_MESSAGE_CONTENT': {
      const key = nsKey(event.messageId)
      if (messages.has(key)) {
        messages.update(key, (draft) => {
          draft.text += event.delta ?? ''
        })
      }
      break
    }
    case 'TOOL_CALL_START':
      upsert(toolCalls, {
        id: nsKey(event.toolCallId),
        threadId,
        channelId,
        agentId,
        name: event.toolCallName ?? 'tool',
        args: '',
        status: 'running',
        ...(event.subagentRunId ? { subagentRunId: event.subagentRunId } : {}),
        createdAt: Date.now(),
      })
      break
    case 'TOOL_CALL_ARGS': {
      const key = nsKey(event.toolCallId)
      if (toolCalls.has(key)) {
        toolCalls.update(key, (draft) => {
          draft.args += event.delta ?? ''
        })
      }
      break
    }
    case 'TOOL_CALL_RESULT': {
      const key = nsKey(event.toolCallId)
      if (toolCalls.has(key)) {
        const { text, truncated } = clampResult(event.content)
        const name = (toolCalls.get(key) as { name?: string } | undefined)?.name
        toolCalls.update(key, (draft) => {
          draft.result = text
          draft.truncated = truncated
          draft.status = 'done'
        })
        // System tools carry structured intents in their result: create a channel,
        // or post a message into another channel. The dashboard realizes them when
        // it observes the tool result on the tail. (memory writes are server-side.)
        if (name === 'pod.channel_create') {
          handleChannelCreate(
            ctx,
            event.toolCallId,
            parseResult(event.content),
            replay,
          )
        } else if (name === 'pod.message_post') {
          handleMessagePost(ctx, event.toolCallId, parseResult(event.content))
        } else {
          // Any other tool result may drive a `tool_result` subscription (e.g. a
          // Reddit news batch triggering the sentiment agent).
          dispatchToolResult(
            ctx,
            channelId,
            event.toolCallId,
            name,
            parseResult(event.content),
            replay,
          )
        }
      }
      break
    }
    case 'CUSTOM':
      // An injected tool call tags its tool-call id with the trigger, so the
      // channel view can render it as a structured, distinctly-badged card.
      if (event.name === 'tanstack.injection' && event.value?.toolCallId) {
        const key = nsKey(event.value.toolCallId)
        if (toolCalls.has(key)) {
          toolCalls.update(key, (draft) => {
            draft.trigger = event.value.trigger
          })
        }
      }
      if (event.name === 'tanstack.spend') {
        const c = event.value?.cumulative ?? {}
        upsert(
          spend,
          {
            id: threadId,
            threadId,
            channelId,
            agentId,
            inputTokens: c.inputTokens ?? 0,
            outputTokens: c.outputTokens ?? 0,
            totalTokens: c.totalTokens ?? 0,
          },
          (draft) => {
            draft.inputTokens = c.inputTokens ?? draft.inputTokens
            draft.outputTokens = c.outputTokens ?? draft.outputTokens
            draft.totalTokens = c.totalTokens ?? draft.totalTokens
            draft.channelId = channelId
            draft.agentId = agentId
          },
        )
      }
      break
    case 'RUN_FINISHED': {
      // The raw feed tail carries per-turn usage here (no spend ticks), so sum
      // it into the spend row. The back-compat path uses `tanstack.spend` ticks.
      if (ctx.viaTail) {
        const usage = Array.isArray(event.usage) ? event.usage : []
        const input = usage.reduce(
          (sum: number, u: any) => sum + (u.inputTokens ?? 0),
          0,
        )
        const output = usage.reduce(
          (sum: number, u: any) => sum + (u.outputTokens ?? 0),
          0,
        )
        if (input || output) {
          upsert(
            spend,
            {
              id: threadId,
              threadId,
              channelId,
              agentId,
              inputTokens: input,
              outputTokens: output,
              totalTokens: input + output,
            },
            (draft) => {
              draft.inputTokens += input
              draft.outputTokens += output
              draft.totalTokens += input + output
            },
          )
        }
      }
      // On replay, approvals come from the live snapshot (a resolved interrupt
      // has no clearing event in the stream), so don't recreate them here.
      if (!replay && event.outcome?.type === 'interrupt') {
        for (const interrupt of event.outcome.interrupts ?? []) {
          upsert(approvals, {
            id: nsKey(interrupt.id),
            threadId,
            channelId,
            agentId,
            interruptId: interrupt.id,
            toolCallId: interrupt.toolCallId
              ? nsKey(interrupt.toolCallId)
              : undefined,
            reason: interrupt.reason ?? 'tool_call',
            message: interrupt.message ?? 'Approval required',
            responseSchema: interrupt.responseSchema,
            status: 'pending',
            createdAt: Date.now(),
          })
        }
        setStatus(ctx, 'requires_action')
      } else {
        setStatus(ctx, 'idle')
      }
      break
    }
    default:
      break
  }
}

/* ------------------------------------------------------------------ */
/* System tools: channel_create, message_post, subscription dispatch   */
/* ------------------------------------------------------------------ */

function parseResult(content: unknown): any {
  if (content && typeof content === 'object') return content
  if (typeof content === 'string') {
    try {
      return JSON.parse(content)
    } catch {
      return {}
    }
  }
  return {}
}

/** The team a member belongs to (from its roster row), for channel placement. */
function teamIdForAgent(agentId: string): string | undefined {
  const row = (memberships.toArray as Array<MembershipRow>).find(
    (m) => m.agentId === agentId,
  )
  if (!row) return undefined
  return row.teamId ?? channels.get(row.channelId)?.teamId
}

/** The team's main channel id, where system cards (channel_created) render. */
function mainChannelId(teamId: string): string | undefined {
  return (channels.toArray as Array<any>).find(
    (c) => c.teamId === teamId && c.kind === 'main',
  )?.id
}

function memberFromRow(row: MembershipRow): Member {
  return {
    channelId: row.channelId,
    agentId: row.agentId,
    threadId: row.threadId,
    teamId: row.teamId,
    harness: row.harness,
    role: row.role,
    displayName: row.displayName,
  }
}

function addChannelMemberRow(
  channelId: string,
  agentId: string,
  threadId: string,
): void {
  upsert(channelMembers, {
    id: `${channelId}:${agentId}`,
    channelId,
    agentId,
    threadId,
    joinedAt: Date.now(),
  })
  persistRoster()
}

/** A member created a channel: register it, announce it, dispatch subscriptions. */
function handleChannelCreate(
  ctx: Ctx,
  toolCallId: string,
  res: any,
  replay = false,
): void {
  const channelId: string | undefined = res.channelId
  if (!channelId || channels.has(channelId)) return
  const teamId = res.teamId || teamIdForAgent(ctx.agentId)
  if (!teamId) return
  const kind = res.kind === 'dm' ? 'dm' : 'dynamic'
  upsert(channels, {
    id: channelId,
    teamId,
    name: res.name ?? 'channel',
    kind,
    topic: res.topic || undefined,
    createdBy: ctx.agentId,
    createdAt: Date.now(),
  })
  persistRoster()
  // Explicitly-listed members (e.g. a DM's two participants) join. The creator
  // of a dynamic channel does not auto-join — it can post via `pod.message_post`
  // (routed by channel id) without being a participant, so a watcher can open a
  // review channel it doesn't sit in. Subscribers join via dispatch below.
  for (const agentId of (res.members as Array<string> | undefined) ?? []) {
    const row = (memberships.toArray as Array<MembershipRow>).find(
      (m) => m.agentId === agentId,
    )
    if (row) addChannelMemberRow(channelId, agentId, row.threadId)
  }
  // Announce it in the team's main channel as a system card.
  const main = mainChannelId(teamId)
  if (main) {
    upsert(messages, {
      id: `sys-created:${channelId}`,
      threadId: ctx.threadId,
      channelId: main,
      agentId: ctx.agentId,
      role: 'system',
      text: `Channel #${res.name ?? 'channel'} created`,
      system: {
        kind: 'channel_created',
        channelId,
        channelName: res.name,
        topic: res.topic,
      },
      createdAt: Date.now(),
    })
  }
  // If the creating agent posted an opening message, place it in the channel.
  if (res.initialMessage) {
    upsert(messages, {
      id: `${ctx.agentId}:open:${toolCallId}`,
      threadId: ctx.threadId,
      channelId,
      agentId: ctx.agentId,
      role: 'assistant',
      text: res.initialMessage,
      createdAt: Date.now(),
    })
  }
  // Don't fire subscription runs while rehydrating history — only for live events.
  if (!replay) {
    dispatchChannelCreated(teamId, channelId, res.name ?? 'channel', res.topic)
  }
}

/** A member posted into a channel: place the message there, attributed to it. */
function handleMessagePost(ctx: Ctx, toolCallId: string, res: any): void {
  if (!res.channelId || typeof res.content !== 'string') return
  upsert(messages, {
    id: `${ctx.agentId}:post:${toolCallId}`,
    threadId: ctx.threadId,
    channelId: res.channelId,
    agentId: ctx.agentId,
    role: 'assistant',
    text: res.content,
    createdAt: Date.now(),
  })
}

/**
 * Subscription dispatch: when a channel is created, members subscribed to
 * `channel_created` react. `join` adds them to the channel (+ a system note);
 * `trigger` injects a templated review request (which carries their pod memory
 * via `/api/run`). Not an orchestrator — the subscription made executable.
 */
const dispatched = new Set<string>()
function dispatchChannelCreated(
  teamId: string,
  channelId: string,
  name: string,
  topic?: string,
): void {
  if (dispatched.has(channelId)) return
  dispatched.add(channelId)
  const members = (memberships.toArray as Array<MembershipRow>).filter(
    (m) => (m.teamId ?? channels.get(m.channelId)?.teamId) === teamId,
  )
  const has = (subs: Array<Subscription> | undefined, action: string) =>
    (subs ?? []).some(
      (s) => s.event === 'channel_created' && s.action === action,
    )
  // Joins first, so a triggered run's events project into the channel it joined.
  for (const m of members) {
    if (!has(m.subscriptions, 'join')) continue
    addChannelMemberRow(channelId, m.agentId, m.threadId)
    openChannelMember(memberFromRow(m))
    upsert(messages, {
      id: `sys-join:${channelId}:${m.agentId}`,
      threadId: m.threadId,
      channelId,
      agentId: m.agentId,
      role: 'system',
      text: `${m.displayName} joined`,
      system: { kind: 'member_joined', channelId, who: m.displayName },
      createdAt: Date.now(),
    })
  }
  for (const m of members) {
    if (!has(m.subscriptions, 'trigger')) continue
    setActiveChannel(m.threadId, channelId)
    void triggerRun(
      m.threadId,
      `[channel:${channelId}] A new channel #${name} was created: ${topic ?? name}. Please review it and post your findings.`,
    )
  }
}

/**
 * Subscription dispatch for tool results: when a tool's result lands in a
 * channel, members subscribed to `{ event: 'tool_result', tool, action: 'trigger' }`
 * are run with the batch as a prompt (carrying their pod memory via `/api/run`).
 * The trigger path spends zero tokens; only the triggered run costs anything.
 *
 * Bounce guard: only the named tool triggers, and the triggered agent replies
 * with chat text (or other tools) — never the trigger tool itself — so no cycle
 * forms. Replays don't re-dispatch, so a reload never re-spends.
 */
const dispatchedResult = new Set<string>()
function dispatchToolResult(
  ctx: Ctx,
  channelId: string,
  toolCallId: string,
  toolName: string | undefined,
  result: any,
  replay: boolean,
): void {
  if (replay || !toolName || dispatchedResult.has(toolCallId)) return
  const teamId = teamIdForAgent(ctx.agentId)
  if (!teamId) return
  const members = (memberships.toArray as Array<MembershipRow>).filter(
    (m) => (m.teamId ?? channels.get(m.channelId)?.teamId) === teamId,
  )
  const subscribers = members.filter((m) =>
    (m.subscriptions ?? []).some(
      (s) =>
        s.event === 'tool_result' &&
        s.action === 'trigger' &&
        s.tool === toolName,
    ),
  )
  if (!subscribers.length) return
  dispatchedResult.add(toolCallId)
  const message = formatBatch(result)
  for (const m of subscribers) {
    setActiveChannel(m.threadId, channelId)
    openChannelMember(memberFromRow(m))
    void triggerRun(m.threadId, `[channel:${channelId}] ${message}`)
  }
}

/** Cap the batch to 10 items (titles + permalinks + snippets) for the prompt. */
function formatBatch(result: any): string {
  const items: Array<any> = Array.isArray(result?.items)
    ? result.items
    : Array.isArray(result)
      ? result
      : []
  const capped = items.slice(0, 10)
  const lines = capped.map(
    (it, i) =>
      `${i + 1}. ${it.title ?? '(untitled)'} — ${it.permalink ?? it.url ?? ''}` +
      (it.snippet ? `\n   ${it.snippet}` : ''),
  )
  return (
    `New React news batch (${capped.length} item${capped.length === 1 ? '' : 's'}):\n` +
    lines.join('\n')
  )
}

/** POST the memory-attaching run trigger and record how much memory was attached. */
async function triggerRun(threadId: string, message: string): Promise<void> {
  try {
    const harness = membersByThread.get(threadId)?.harness
    const res = await fetch(`${origin()}/api/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ threadId, message, harness }),
    })
    const data = await res.json()
    upsert(
      runMeta,
      {
        id: threadId,
        threadId,
        attached: data.attached ?? 0,
        updatedAt: Date.now(),
      },
      (draft) => {
        draft.attached = data.attached ?? 0
        draft.updatedAt = Date.now()
      },
    )
  } catch {
    // best-effort trigger
  }
}

function agentFor(threadId: string, endpoint: string): Entry {
  let entry = registry.get(threadId)
  if (!entry) {
    const agent = new HttpAgent({ url: `${origin()}${endpoint}`, threadId })
    entry = { agent, subscribed: false }
    registry.set(threadId, entry)
  }
  return entry
}

/** Subscribe a member's HttpAgent so its events project into the channel. */
function subscribeMember(member: Member): Entry {
  membersByThread.set(member.threadId, member)
  const entry = agentFor(member.threadId, endpointFor(member.harness))
  if (!entry.subscribed) {
    const ctx: Ctx = {
      threadId: member.threadId,
      channelId: member.channelId,
      agentId: member.agentId,
    }
    entry.agent.subscribe({
      onEvent: ({ event }) => project(ctx, event as any),
    })
    entry.subscribed = true
  }
  return entry
}

/* ------------------------------------------------------------------ */
/* Team / channel construction                                         */
/* ------------------------------------------------------------------ */

let seq = 0
const rid = (p: string) =>
  `${p}-${Math.random().toString(36).slice(2, 8)}-${(seq += 1)}`

/**
 * What each agent reacts to by default — the agent "knows" its own triggers, so
 * dropping it into any team wires the right subscription automatically (no demo
 * seed required). `security/review` joins + reviews every new channel;
 * `sentiment/react` reacts to a Reddit news batch landing. Editable per member
 * via the roster's subscribe toggle.
 */
const DEFAULT_SUBSCRIPTIONS: Record<string, Array<Subscription>> = {
  'security/review': [
    { event: 'channel_created', action: 'join' },
    { event: 'channel_created', action: 'trigger' },
  ],
  'sentiment/react': [
    {
      event: 'tool_result',
      tool: 'reddit.search_react_news',
      action: 'trigger',
    },
  ],
}
export function defaultSubscriptions(
  harness: string,
): Array<Subscription> | undefined {
  return DEFAULT_SUBSCRIPTIONS[harness]
}

/** Add a member (a fresh thread) to an existing channel and start streaming it. */
export function addAgentToChannel(
  channelId: string,
  harness: string,
  role: MemberRole = 'agent',
  displayName?: string,
  subscriptions?: Array<Subscription>,
): Member {
  // Fall back to the harness's default subscriptions so a composed team behaves
  // like the seeded demo. Pass `[]` explicitly to opt out.
  const subs = subscriptions ?? defaultSubscriptions(harness)
  const existing = (memberships.toArray as Array<any>).filter(
    (m) => m.channelId === channelId && m.harness === harness,
  ).length
  const threadId =
    role === 'operator'
      ? `meta-${Math.random().toString(36).slice(2, 8)}`
      : rid(shortName(harness))
  const teamId = channels.get(channelId)?.teamId
  const member: Member = {
    channelId,
    agentId: threadId,
    threadId,
    teamId,
    harness,
    role,
    displayName:
      displayName ??
      `${shortName(harness)}${existing ? ` ${existing + 1}` : ''}`,
  }
  upsert(memberships, {
    id: `${channelId}:${member.agentId}`,
    channelId,
    teamId,
    agentId: member.agentId,
    threadId,
    harness,
    role,
    displayName: member.displayName,
    ...(subs ? { subscriptions: subs } : {}),
    joinedAt: Date.now(),
  })
  subscribeMember(member)
  persistRoster()
  return member
}

/** Create a team with one main channel and a first agent member. */
export function createTeam(
  name: string,
  harness = 'support/triage',
): { teamId: string; channelId: string } {
  const teamId = rid('team')
  const channelId = rid('chan')
  upsert(teams, { id: teamId, name, createdAt: Date.now() })
  upsert(channels, {
    id: channelId,
    teamId,
    name: 'main',
    kind: 'main',
    createdAt: Date.now(),
  })
  addAgentToChannel(channelId, harness, 'agent')
  persistRoster()
  return { teamId, channelId }
}

/**
 * The PR-watcher demo team: a watcher agent + a security reviewer. The reviewer's
 * `channel_created` (join + trigger) subscription is its harness default, so
 * sending a PR webhook drives the whole "the pod learns" loop.
 */
export function createPrWatcherTeam(): { teamId: string; channelId: string } {
  const { teamId, channelId } = createTeam('PR watcher', 'ops/pr-watcher')
  addAgentToChannel(channelId, 'security/review', 'agent', 'security')
  return { teamId, channelId }
}

/**
 * The Reddit pod demo team: a procedural `reddit/fetcher` + a real-LLM
 * `sentiment/react`. The sentiment agent's `tool_result` subscription is its
 * harness default, so run-now (or a schedule) on the fetch posts a digest
 * unprompted — the same as composing the team by hand.
 */
export function createReactNewsTeam(): { teamId: string; channelId: string } {
  const { teamId, channelId } = createTeam('react-news', 'reddit/fetcher')
  addAgentToChannel(channelId, 'sentiment/react', 'agent', 'sentiment')
  return { teamId, channelId }
}

/** Rehydrate a member's thread from stored events (replay). Once per thread. */
const hydrated = new Set<string>()
export async function hydrateMember(member: Member): Promise<void> {
  if (hydrated.has(member.threadId)) return
  hydrated.add(member.threadId)
  subscribeMember(member)
  const ctx: Ctx = {
    threadId: member.threadId,
    channelId: member.channelId,
    agentId: member.agentId,
  }
  try {
    const res = await fetch(
      `${origin()}/api/replay?threadId=${encodeURIComponent(member.threadId)}`,
    )
    if (!res.ok) return
    const data = await res.json()
    for (const entry of data.events ?? []) {
      project(ctx, entry.event, true)
    }
    for (const interrupt of data.pendingInterrupts ?? []) {
      upsert(approvals, {
        id: `${member.agentId}:${interrupt.id}`,
        threadId: member.threadId,
        channelId: member.channelId,
        agentId: member.agentId,
        interruptId: interrupt.id,
        toolCallId: interrupt.toolCallId
          ? `${member.agentId}:${interrupt.toolCallId}`
          : undefined,
        reason: interrupt.reason ?? 'tool_call',
        message: interrupt.message ?? 'Approval required',
        responseSchema: interrupt.responseSchema,
        status: 'pending',
        createdAt: Date.now(),
      })
    }
    setStatus(ctx, data.status ?? 'idle')
  } catch {
    // best-effort replay
  }
}

/* ------------------------------------------------------------------ */
/* Back-compat, thread-keyed API (single-member routes)                */
/* ------------------------------------------------------------------ */

/** Create + subscribe the agent for a thread so its events start projecting. */
export function ensureSession(threadId: string, endpoint = '/api/agent'): void {
  subscribeMember(memberFromThread(threadId, endpoint))
}

/** Rehydrate a single-thread session view (back-compat for /sessions, history). */
export async function hydrateSession(
  threadId: string,
  endpoint = '/api/agent',
): Promise<void> {
  await hydrateMember(memberFromThread(threadId, endpoint))
}

/** Send a user prompt to a member's thread and stream the reply in. */
export async function sendPrompt(
  threadId: string,
  text: string,
  endpoint = '/api/agent',
  channelId = `channel-${threadId}`,
): Promise<void> {
  const member = membersByThread.get(threadId) ?? {
    ...memberFromThread(threadId, endpoint),
    channelId,
  }
  const entry = subscribeMember(member)
  upsert(messages, {
    id: `user-${Date.now()}`,
    threadId,
    channelId: member.channelId,
    agentId: 'user',
    role: 'user',
    text,
    createdAt: Date.now(),
  })
  entry.agent.addMessage({ id: `u-${Date.now()}`, role: 'user', content: text })
  await entry.agent.runAgent()
}

export type ApprovalDecision = 'approve' | 'deny'

/**
 * Resolve an approval. `approve` goes through the AG-UI resume flow (a new run,
 * so the continuation streams back). `deny` goes through the harness-native
 * control endpoint — exercising both paths the interrupt supports. The stored
 * raw `interruptId` is what the server understands (the row `id` is namespaced).
 */
export async function resolveApproval(
  threadId: string,
  approvalId: string,
  decision: ApprovalDecision,
  editedArgs?: Record<string, unknown>,
): Promise<void> {
  // The raw interrupt id: stored on the row, or de-namespaced from the row id.
  const row = approvals.has(approvalId)
    ? (approvals.get(approvalId) as { interruptId?: string; threadId?: string })
    : undefined
  const rawInterruptId =
    row?.interruptId ??
    (approvalId.includes(':')
      ? approvalId.split(':').slice(1).join(':')
      : approvalId)
  const targetThread = row?.threadId ?? threadId

  if (approvals.has(approvalId)) {
    approvals.update(approvalId, (draft) => {
      draft.status = decision === 'approve' ? 'approved' : 'denied'
    })
  }

  const member = membersByThread.get(targetThread)
  const endpoint = member ? endpointFor(member.harness) : '/api/agent'

  if (decision === 'approve') {
    const payload = editedArgs ? { approved: true, editedArgs } : true
    const entry = agentFor(targetThread, endpoint)
    await entry.agent.runAgent({
      resume: [{ interruptId: rawInterruptId, status: 'resolved', payload }],
    })
    return
  }

  // Harness-native path.
  await fetch(`${origin()}/api/harness/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      threadId: targetThread,
      input: {
        op: 'resolve',
        resume: [
          { interruptId: rawInterruptId, status: 'cancelled', payload: false },
        ],
      },
    }),
  })
  if (sessions.has(targetThread)) {
    sessions.update(targetThread, (draft) => {
      draft.status = 'idle'
    })
  }
}

/* ------------------------------------------------------------------ */
/* Channel tail + injection (teams view)                               */
/* ------------------------------------------------------------------ */

const tailed = new Set<string>()

/**
 * Open a live tail of a member's feed and project every event — interactive runs,
 * injected tools, timers, webhooks — the single projection path for the channel
 * view. The tail replays from the start then follows live, so it also rehydrates.
 * An HttpAgent is created for triggering runs but is NOT subscribed (the tail is
 * the only projector, so nothing is counted twice).
 */
export function openChannelMember(member: Member): void {
  membersByThread.set(member.threadId, member)
  agentFor(member.threadId, endpointFor(member.harness))
  if (tailed.has(member.threadId) || typeof window === 'undefined') return
  tailed.add(member.threadId)
  const ctx: Ctx = {
    threadId: member.threadId,
    channelId: member.channelId,
    agentId: member.agentId,
    viaTail: true,
  }
  const source = new EventSource(
    `${origin()}/api/tail?threadId=${encodeURIComponent(member.threadId)}&harness=${encodeURIComponent(member.harness)}`,
  )
  source.onmessage = (message) => {
    try {
      const parsed = JSON.parse(message.data)
      // First frame: the authoritative snapshot. Seed the still-pending approvals
      // (a resolved interrupt is absent here, so it never resurfaces on reload).
      if (parsed.snapshot) {
        for (const interrupt of parsed.snapshot.pendingInterrupts ?? []) {
          upsert(approvals, {
            id: `${ctx.agentId}:${interrupt.id}`,
            threadId: ctx.threadId,
            channelId: ctx.channelId,
            agentId: ctx.agentId,
            interruptId: interrupt.id,
            toolCallId: interrupt.toolCallId
              ? `${ctx.agentId}:${interrupt.toolCallId}`
              : undefined,
            reason: interrupt.reason ?? 'tool_call',
            message: interrupt.message ?? 'Approval required',
            responseSchema: interrupt.responseSchema,
            status: 'pending',
            createdAt: Date.now(),
          })
        }
        return
      }
      project(ctx, parsed.event, parsed.replay === true)
    } catch {
      // ignore malformed frames
    }
  }
}

/**
 * Trigger a model run for a channel member via the memory-attaching run trigger
 * (`/api/run`). Projection comes from the tail. `channelId` is the channel the
 * human is looking at — the member becomes active there, so its run projects into
 * that channel (not just its home channel).
 */
export async function channelSendPrompt(
  member: Member,
  text: string,
  channelId: string = member.channelId,
): Promise<void> {
  openChannelMember(member)
  setActiveChannel(member.threadId, channelId)
  upsert(messages, {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    threadId: member.threadId,
    channelId,
    agentId: 'user',
    role: 'user',
    text,
    createdAt: Date.now(),
  })
  await triggerRun(member.threadId, `[channel:${channelId}] ${text}`)
}

/**
 * Open a DM with an agent, dashboard-initiated (out-of-band `pod.channel_create`
 * issued on `from`'s thread). The DM seats just the target agent, so it's the
 * channel's `primary` and receives the operator's messages — a 1:1 chat with
 * that agent. The result flows back through `from`'s tail and the projector
 * registers the channel + member.
 */
export async function createDm(
  from: Member,
  toAgentId: string,
  toName: string,
): Promise<void> {
  openChannelMember(from)
  await fetch(`${origin()}/api/inject`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      threadId: from.threadId,
      channelId: from.channelId,
      harness: from.harness,
      tool: 'pod.channel_create',
      args: {
        name: `dm-${toName}`,
        kind: 'dm',
        members: [toAgentId],
      },
    }),
  })
}

/** Inject a public tool out-of-band on a member (run-now). Result via the tail. */
export async function runInjection(
  member: Pick<Member, 'threadId' | 'channelId'> & { harness?: string },
  tool: string,
  args?: Record<string, unknown>,
): Promise<{ status: string; reason?: string }> {
  const res = await fetch(`${origin()}/api/inject`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      threadId: member.threadId,
      channelId: member.channelId,
      harness: member.harness,
      tool,
      args: args ?? {},
    }),
  })
  return res.json()
}
