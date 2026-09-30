import { normalizeToolResult } from '@tanstack/ai'
import type {
  AnyChatMiddleware,
  ModelMessage,
  RunRecord,
  RunStore,
} from '@tanstack/ai'
import type { MessageStore } from '@tanstack/ai-persistence'

/** How often a running host renews its lease, and when a lease expires. */
export const LEASE = { renewMs: 10_000, ttlMs: 30_000 }

/** Lease timing for a host. A missing field uses {@link LEASE}. */
export interface LeaseOptions {
  /** How long a lease lasts after each renewal, in milliseconds. */
  ttlMs?: number
  /** How often the running host renews its lease, in milliseconds. */
  renewMs?: number
}

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

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/**
 * Chat middleware that makes a turn resumable after a crash:
 *
 * - holds a lease on the run record and renews it while the turn runs;
 * - saves the transcript before and after each tool phase;
 * - records each tool call that started but has no result yet;
 * - gives `onToolResult` the tool message of each call that ends.
 */
export function checkpointMiddleware(options: {
  runs?: RunStore
  messages: MessageStore
  hostId: string
  lease?: LeaseOptions
  /** Called after each tool call ends, with the tool message the model gets. */
  onToolResult?: (info: {
    toolCallId: string
    message: ModelMessage
  }) => void | Promise<void>
}): AnyChatMiddleware {
  const { runs, messages, hostId, onToolResult } = options
  const ttlMs = options.lease?.ttlMs ?? LEASE.ttlMs
  const renewMs = options.lease?.renewMs ?? LEASE.renewMs
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
          leaseExpiresAt: Date.now() + ttlMs,
        })
      await renew()
      const timer = setInterval(() => void renew(), renewMs)
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
      if (!onToolResult) return
      // The same content the engine puts in its tool message.
      const message: ModelMessage = info.ok
        ? {
            role: 'tool',
            toolCallId: info.toolCallId,
            content: normalizeToolResult(info.result),
          }
        : {
            role: 'tool',
            toolCallId: info.toolCallId,
            content: JSON.stringify({ error: errorText(info.error) }),
            error: errorText(info.error),
          }
      await onToolResult({ toolCallId: info.toolCallId, message })
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
  runs: RunStore | undefined,
  threadId: string,
  now = Date.now(),
): Promise<Array<RunRecord>> {
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
 * Prepare the transcript of a crashed run for a new run:
 *
 * - A call in `finished` gets its finished tool message. It does not run
 *   again.
 * - Another call with `replay: 'never'` gets {@link INTERRUPTED_TOOL_RESULT}
 *   as a tool error.
 * - Another call with `replay: 'safe'` stays without a result, so the engine
 *   runs it again.
 */
export async function repairTranscript(options: {
  messages: MessageStore
  crashed: RunRecord
  /** Tool messages of calls that finished before the crash, by toolCallId. */
  finished?: ReadonlyMap<string, ModelMessage>
}): Promise<void> {
  const { messages, crashed, finished } = options
  const pending = crashed.checkpoint?.pendingTools ?? []
  if (pending.length === 0) return
  const history = await messages.loadThread(crashed.threadId)
  const answered = new Set(
    history.flatMap((message) =>
      message.role === 'tool' && message.toolCallId ? [message.toolCallId] : [],
    ),
  )
  const unanswered = pending.filter((tool) => !answered.has(tool.toolCallId))
  const added = unanswered.flatMap((tool): Array<ModelMessage> => {
    const result = finished?.get(tool.toolCallId)
    if (result) return [result]
    if (tool.replay === 'safe') return []
    return [
      {
        role: 'tool',
        toolCallId: tool.toolCallId,
        content: JSON.stringify(INTERRUPTED_TOOL_RESULT),
        error: INTERRUPTED_TOOL_RESULT.note,
      },
    ]
  })
  if (added.length > 0) {
    await messages.saveThread(crashed.threadId, [...history, ...added])
  }
}
