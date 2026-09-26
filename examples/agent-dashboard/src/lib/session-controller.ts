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
  channels,
  memberships,
  messages,
  sessions,
  spend,
  teams,
  toolCalls,
  upsert,
} from '@/db/collections'

export type MemberRole = 'agent' | 'operator'

export interface Member {
  channelId: string
  /** Unique per member; equals `threadId` in Phase 1. */
  agentId: string
  threadId: string
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
}

function setStatus(
  ctx: Ctx,
  status: 'idle' | 'running' | 'requires_action',
) {
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

/** Project one AG-UI event into the collections, namespaced to a member. */
function project(ctx: Ctx, event: any, replay = false) {
  const { threadId, channelId, agentId } = ctx
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
        toolCalls.update(key, (draft) => {
          draft.result =
            typeof event.content === 'string'
              ? event.content
              : JSON.stringify(event.content)
          draft.status = 'done'
        })
      }
      break
    }
    case 'CUSTOM':
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
    case 'RUN_FINISHED':
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
    default:
      break
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
const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}-${(seq += 1)}`

/** Add a member (a fresh thread) to an existing channel and start streaming it. */
export function addAgentToChannel(
  channelId: string,
  harness: string,
  role: MemberRole = 'agent',
  displayName?: string,
): Member {
  const existing = (memberships.toArray as Array<any>).filter(
    (m) => m.channelId === channelId && m.harness === harness,
  ).length
  const threadId =
    role === 'operator'
      ? `meta-${Math.random().toString(36).slice(2, 8)}`
      : rid(shortName(harness))
  const member: Member = {
    channelId,
    agentId: threadId,
    threadId,
    harness,
    role,
    displayName:
      displayName ?? `${shortName(harness)}${existing ? ` ${existing + 1}` : ''}`,
  }
  upsert(memberships, {
    id: `${channelId}:${member.agentId}`,
    channelId,
    agentId: member.agentId,
    threadId,
    harness,
    role,
    displayName: member.displayName,
    joinedAt: Date.now(),
  })
  subscribeMember(member)
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
    (approvalId.includes(':') ? approvalId.split(':').slice(1).join(':') : approvalId)
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
        resume: [{ interruptId: rawInterruptId, status: 'cancelled', payload: false }],
      },
    }),
  })
  if (sessions.has(targetThread)) {
    sessions.update(targetThread, (draft) => {
      draft.status = 'idle'
    })
  }
}
