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

export type PendingTool = {
  toolCallId: string
  name: string
  replay: 'safe' | 'never'
}

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/**
 * Hold the lease on run `runId` and renew it. Returns the function that stops
 * the renewal. A host that stops lets the lease expire, so recovery can tell
 * the run is dead.
 */
export async function holdRunLease(
  runs: RunStore | undefined,
  runId: string,
  hostId: string,
  lease?: LeaseOptions,
): Promise<() => void> {
  if (!runs) return () => {}
  const ttlMs = lease?.ttlMs ?? LEASE.ttlMs
  const renew = () =>
    runs.update(runId, {
      leaseOwner: hostId,
      leaseExpiresAt: Date.now() + ttlMs,
    })
  await renew()
  const timer = setInterval(() => void renew(), lease?.renewMs ?? LEASE.renewMs)
  // A lease timer must not keep a CLI or a test process alive.
  if (typeof timer === 'object' && 'unref' in timer) timer.unref()
  return () => clearInterval(timer)
}

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
  /** Called before each tool call runs, after its checkpoint is saved. */
  onToolStart?: (info: {
    toolCallId: string
    name: string
    replay: 'safe' | 'never'
  }) => void | Promise<void>
  /** Called after each tool call ends, with the tool message the model gets. */
  onToolResult?: (info: {
    toolCallId: string
    message: ModelMessage
  }) => void | Promise<void>
}): AnyChatMiddleware {
  const { runs, messages, hostId, onToolResult } = options
  const state = new WeakMap<
    object,
    { stopLease: () => void; pending: Array<PendingTool> }
  >()

  const saveCheckpoint = async (runId: string, pending: Array<PendingTool>) => {
    await runs?.update(runId, {
      checkpoint: { at: Date.now(), pendingTools: [...pending] },
    })
  }
  const stop = (ctx: object) => {
    state.get(ctx)?.stopLease()
    state.delete(ctx)
  }

  return {
    name: 'harness:checkpoint',
    async onStart(ctx) {
      const stopLease = await holdRunLease(
        runs,
        ctx.runId,
        hostId,
        options.lease,
      )
      state.set(ctx, { stopLease, pending: [] })
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
      await options.onToolStart?.({
        toolCallId: hook.toolCallId,
        name: hook.toolName,
        replay: hook.tool?.replay ?? 'never',
      })
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

/** Chat and agent runs of this thread that a crashed host left `running`. */
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
      (record.kind === undefined ||
        record.kind === 'chat' ||
        record.kind === 'agent') &&
      record.leaseExpiresAt !== undefined &&
      record.leaseExpiresAt < now,
  )
}

/**
 * Prepare the transcript of a crashed thread for a new run. It walks the tool
 * calls of the batch (the last assistant message with tool calls) in order:
 *
 * - A call in `finished` gets its finished tool message. It does not run
 *   again.
 * - A pending call with `replay: 'never'` gets
 *   {@link INTERRUPTED_TOOL_RESULT} as a tool error.
 * - A pending call with `replay: 'safe'`, or a call that never started, stays
 *   without a result, so the engine runs it.
 */
export async function repairTranscript(options: {
  messages: MessageStore
  threadId: string
  /** The tool calls that started and have no result. */
  pending: ReadonlyArray<PendingTool>
  /** Tool messages of calls that finished before the crash, by toolCallId. */
  finished?: ReadonlyMap<string, ModelMessage>
}): Promise<void> {
  const { messages, threadId, pending, finished } = options
  if (pending.length === 0 && (finished?.size ?? 0) === 0) return
  const history = await messages.loadThread(threadId)
  const answered = new Set(
    history.flatMap((message) =>
      message.role === 'tool' && message.toolCallId ? [message.toolCallId] : [],
    ),
  )
  const batch = history.findLast(
    (message) => message.role === 'assistant' && message.toolCalls?.length,
  )
  const pendingById = new Map(pending.map((tool) => [tool.toolCallId, tool]))
  const callIds = [
    ...new Set([
      ...(batch?.toolCalls ?? []).map((call) => call.id),
      ...pending.map((tool) => tool.toolCallId),
    ]),
  ]
  const added = callIds
    .filter((toolCallId) => !answered.has(toolCallId))
    .flatMap((toolCallId): Array<ModelMessage> => {
      const result = finished?.get(toolCallId)
      if (result) return [result]
      const tool = pendingById.get(toolCallId)
      if (!tool || tool.replay === 'safe') return []
      return [
        {
          role: 'tool',
          toolCallId,
          content: JSON.stringify(INTERRUPTED_TOOL_RESULT),
          error: INTERRUPTED_TOOL_RESULT.note,
        },
      ]
    })
  if (added.length > 0) {
    await messages.saveThread(threadId, [...history, ...added])
  }
}
