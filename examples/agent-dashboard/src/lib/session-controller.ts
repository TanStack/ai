/**
 * The live session controller. One `@ag-ui/client` HttpAgent per thread, whose
 * AG-UI events are projected into TanStack DB collections. The UI is then a live
 * query over those collections — a projection of the event stream, not a poller.
 */
import { HttpAgent } from '@ag-ui/client'
import {
  approvals,
  messages,
  sessions,
  spend,
  toolCalls,
  upsert,
} from '@/db/collections'

interface Entry {
  agent: HttpAgent
  subscribed: boolean
}
const registry = new Map<string, Entry>()

function agentUrl() {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  return `${origin}/api/agent`
}

function setStatus(threadId: string, status: 'idle' | 'running' | 'requires_action') {
  upsert(
    sessions,
    { id: threadId, threadId, status, createdAt: Date.now() },
    (draft) => {
      draft.status = status
    },
  )
}

/** Project one AG-UI event into the collections. */
function project(threadId: string, event: any, replay = false) {
  switch (event.type) {
    case 'RUN_STARTED':
      setStatus(threadId, 'running')
      break
    case 'TEXT_MESSAGE_START':
      upsert(messages, {
        id: event.messageId,
        threadId,
        role: event.role === 'user' ? 'user' : 'assistant',
        text: '',
        ...(event.subagentRunId ? { subagentRunId: event.subagentRunId } : {}),
        createdAt: Date.now(),
      })
      break
    case 'TEXT_MESSAGE_CONTENT':
      if (messages.has(event.messageId)) {
        messages.update(event.messageId, (draft) => {
          draft.text += event.delta ?? ''
        })
      }
      break
    case 'TOOL_CALL_START':
      upsert(toolCalls, {
        id: event.toolCallId,
        threadId,
        name: event.toolCallName ?? 'tool',
        args: '',
        status: 'running',
        ...(event.subagentRunId ? { subagentRunId: event.subagentRunId } : {}),
        createdAt: Date.now(),
      })
      break
    case 'TOOL_CALL_ARGS':
      if (toolCalls.has(event.toolCallId)) {
        toolCalls.update(event.toolCallId, (draft) => {
          draft.args += event.delta ?? ''
        })
      }
      break
    case 'TOOL_CALL_RESULT':
      if (toolCalls.has(event.toolCallId)) {
        toolCalls.update(event.toolCallId, (draft) => {
          draft.result =
            typeof event.content === 'string'
              ? event.content
              : JSON.stringify(event.content)
          draft.status = 'done'
        })
      }
      break
    case 'CUSTOM':
      if (event.name === 'tanstack.spend') {
        const c = event.value?.cumulative ?? {}
        upsert(
          spend,
          {
            id: threadId,
            threadId,
            inputTokens: c.inputTokens ?? 0,
            outputTokens: c.outputTokens ?? 0,
            totalTokens: c.totalTokens ?? 0,
          },
          (draft) => {
            draft.inputTokens = c.inputTokens ?? draft.inputTokens
            draft.outputTokens = c.outputTokens ?? draft.outputTokens
            draft.totalTokens = c.totalTokens ?? draft.totalTokens
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
            id: interrupt.id,
            threadId,
            toolCallId: interrupt.toolCallId,
            reason: interrupt.reason ?? 'tool_call',
            message: interrupt.message ?? 'Approval required',
            responseSchema: interrupt.responseSchema,
            status: 'pending',
            createdAt: Date.now(),
          })
        }
        setStatus(threadId, 'requires_action')
      } else {
        setStatus(threadId, 'idle')
      }
      break
    default:
      break
  }
}

function getEntry(threadId: string): Entry {
  let entry = registry.get(threadId)
  if (!entry) {
    const agent = new HttpAgent({ url: agentUrl(), threadId })
    entry = { agent, subscribed: false }
    registry.set(threadId, entry)
  }
  if (!entry.subscribed) {
    entry.agent.subscribe({
      onEvent: ({ event }) => {
        project(threadId, event as any)
      },
    })
    entry.subscribed = true
  }
  return entry
}

/** Create + subscribe the agent for a thread so its events start projecting. */
export function ensureSession(threadId: string): void {
  getEntry(threadId)
}

const hydrated = new Set<string>()

/**
 * Rehydrate a session view from stored events (replay), for a thread this
 * browser didn't run itself. Runs once per thread; approvals come from the live
 * snapshot so resolved interrupts don't reappear.
 */
export async function hydrateSession(threadId: string): Promise<void> {
  if (hydrated.has(threadId)) return
  hydrated.add(threadId)
  ensureSession(threadId)
  try {
    const res = await fetch(
      `${window.location.origin}/api/replay?threadId=${encodeURIComponent(threadId)}`,
    )
    if (!res.ok) return
    const data = await res.json()
    for (const entry of data.events ?? []) {
      project(threadId, entry.event, true)
    }
    for (const interrupt of data.pendingInterrupts ?? []) {
      upsert(approvals, {
        id: interrupt.id,
        threadId,
        toolCallId: interrupt.toolCallId,
        reason: interrupt.reason ?? 'tool_call',
        message: interrupt.message ?? 'Approval required',
        responseSchema: interrupt.responseSchema,
        status: 'pending',
        createdAt: Date.now(),
      })
    }
    setStatus(threadId, data.status ?? 'idle')
  } catch {
    // best-effort replay
  }
}

/** Send a user prompt and stream the reply into the collections. */
export async function sendPrompt(threadId: string, text: string): Promise<void> {
  const { agent } = getEntry(threadId)
  upsert(messages, {
    id: `user-${Date.now()}`,
    threadId,
    role: 'user',
    text,
    createdAt: Date.now(),
  })
  agent.addMessage({ id: `u-${Date.now()}`, role: 'user', content: text })
  await agent.runAgent()
}

export type ApprovalDecision = 'approve' | 'deny'

/**
 * Resolve an approval. `approve` goes through the AG-UI resume flow (a new run
 * over /api/agent, so the continuation streams back). `deny` goes through the
 * harness-native control endpoint — exercising both paths the spec asks for.
 */
export async function resolveApproval(
  threadId: string,
  interruptId: string,
  decision: ApprovalDecision,
  editedArgs?: Record<string, unknown>,
): Promise<void> {
  if (approvals.has(interruptId)) {
    approvals.update(interruptId, (draft) => {
      draft.status = decision === 'approve' ? 'approved' : 'denied'
    })
  }

  if (decision === 'approve') {
    const payload = editedArgs ? { approved: true, editedArgs } : true
    const { agent } = getEntry(threadId)
    await agent.runAgent({
      resume: [{ interruptId, status: 'resolved', payload }],
    })
    return
  }

  // Harness-native path.
  await fetch(`${window.location.origin}/api/harness/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      threadId,
      input: {
        op: 'resolve',
        resume: [{ interruptId, status: 'cancelled', payload: false }],
      },
    }),
  })
  setStatus(threadId, 'idle')
}
