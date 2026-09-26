import type { AnyChatMiddleware, ModelMessage, RunRecord } from '@tanstack/ai'
import type { HarnessPersistence } from './host'

/** How often a running host renews its lease, and when a lease expires. */
export const LEASE = { renewMs: 10_000, ttlMs: 30_000 }

/** The tool result a crash leaves for a tool that must not run twice. */
export const INTERRUPTED_TOOL_RESULT = {
  interrupted: true,
  note: 'The tool may or may not have run. Check before you retry.',
}

type PendingTool = {
  toolCallId: string
  name: string
  replay: 'safe' | 'never'
}

/**
 * Chat middleware that makes a turn resumable after a crash:
 *
 * - holds a lease on the run record and renews it while the turn runs;
 * - saves the transcript before and after each tool phase;
 * - records each tool call that started but has no result yet.
 */
export function checkpointMiddleware(
  persistence: HarnessPersistence,
  hostId: string,
): AnyChatMiddleware {
  const runs = persistence.stores.runs
  const messages = persistence.stores.messages
  const state = new WeakMap<
    object,
    { timer: ReturnType<typeof setInterval>; pending: Array<PendingTool> }
  >()

  const saveCheckpoint = async (runId: string, pending: Array<PendingTool>) => {
    await runs?.update(runId, {
      checkpoint: { at: Date.now(), pendingTools: [...pending] },
    })
  }
  const stop = (ctx: object) => {
    const entry = state.get(ctx)
    if (entry) clearInterval(entry.timer)
    state.delete(ctx)
  }

  return {
    name: 'harness:checkpoint',
    async onStart(ctx) {
      const renew = () =>
        runs?.update(ctx.runId, {
          leaseOwner: hostId,
          leaseExpiresAt: Date.now() + LEASE.ttlMs,
        })
      await renew()
      const timer = setInterval(() => void renew(), LEASE.renewMs)
      // A lease timer must not keep a CLI or a test process alive.
      if (typeof timer === 'object' && 'unref' in timer) timer.unref()
      state.set(ctx, { timer, pending: [] })
    },
    async onBeforeToolCall(ctx, hook) {
      const entry = state.get(ctx)
      if (!entry) return
      // The first call of a phase: the transcript now holds the assistant
      // message with the tool calls. Save it, so resume can find them.
      if (entry.pending.length === 0) {
        await messages.saveThread(ctx.threadId, [...ctx.messages])
      }
      entry.pending.push({
        toolCallId: hook.toolCallId,
        name: hook.toolName,
        replay: hook.tool?.replay ?? 'never',
      })
      await saveCheckpoint(ctx.runId, entry.pending)
    },
    async onAfterToolCall(ctx, info) {
      const entry = state.get(ctx)
      if (!entry) return
      entry.pending = entry.pending.filter(
        (tool) => tool.toolCallId !== info.toolCallId,
      )
    },
    async onToolPhaseComplete(ctx) {
      const entry = state.get(ctx)
      if (!entry) return
      await messages.saveThread(ctx.threadId, [...ctx.messages])
      entry.pending = []
      await saveCheckpoint(ctx.runId, [])
    },
    onFinish: (ctx) => stop(ctx),
    onAbort: (ctx) => stop(ctx),
    onError: (ctx) => stop(ctx),
  }
}

/** Chat runs of this thread that a crashed host left `running`. */
export async function findCrashedRuns(
  persistence: HarnessPersistence,
  threadId: string,
  now = Date.now(),
): Promise<Array<RunRecord>> {
  const runs = persistence.stores.runs
  if (!runs?.listByThread) return []
  const records = await runs.listByThread(threadId)
  return records.filter(
    (record) =>
      record.status === 'running' &&
      (record.kind === undefined || record.kind === 'chat') &&
      record.leaseExpiresAt !== undefined &&
      record.leaseExpiresAt < now,
  )
}

/**
 * Prepare the transcript of a crashed run for a new run. A tool with
 * `replay: 'never'` gets {@link INTERRUPTED_TOOL_RESULT}. A tool with
 * `replay: 'safe'` stays without a result, so the engine runs it again.
 */
export async function repairTranscript(
  persistence: HarnessPersistence,
  crashed: RunRecord,
): Promise<void> {
  const pending = crashed.checkpoint?.pendingTools ?? []
  const never = pending.filter((tool) => tool.replay === 'never')
  if (never.length === 0) return
  const store = persistence.stores.messages
  const history = await store.loadThread(crashed.threadId)
  const answered = new Set(
    history.flatMap((message) =>
      message.role === 'tool' && message.toolCallId ? [message.toolCallId] : [],
    ),
  )
  const notes = never
    .filter((tool) => !answered.has(tool.toolCallId))
    .map(
      (tool): ModelMessage => ({
        role: 'tool',
        toolCallId: tool.toolCallId,
        content: JSON.stringify(INTERRUPTED_TOOL_RESULT),
      }),
    )
  if (notes.length > 0) {
    await store.saveThread(crashed.threadId, [...history, ...notes])
  }
}
