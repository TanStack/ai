import { defineChatMiddleware } from '@tanstack/ai'
import {
  InterruptsCapability,
  LocksCapability,
  PersistenceCapability,
  provideInterrupts,
  provideLocks,
  providePersistence,
} from './capabilities'
import {
  validateChatPersistenceStores,
  validatePersistenceStoreKeys,
} from './types'
import type {
  AbortInfo,
  ChatMiddleware,
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  ChatResumeToolState,
  ErrorInfo,
  FinishInfo,
  GenerationAbortInfo,
  GenerationErrorInfo,
  GenerationFinishInfo,
  GenerationMiddleware,
  GenerationMiddlewareContext,
  RunAgentResumeItem,
  StreamChunk,
  TokenUsage,
} from '@tanstack/ai'
import type {
  AIPersistence,
  AIPersistenceStores,
  InterruptRecord,
  RunStore,
} from './types'

interface RunStateEntry {
  merged: boolean
  interrupted: boolean
  /**
   * Resumes accepted in `onConfig` but not yet committed to the interrupt
   * store. They are applied (resolve/cancel) only once the run reaches a
   * successful boundary — see {@link commitPendingResumes}. Left uncommitted
   * (still pending in the store) if the run fails or aborts first.
   */
  pendingResumes?: {
    pending: Array<InterruptRecord>
    resumeByInterruptId: Map<string, RunAgentResumeItem>
  }
}

const runState = new WeakMap<object, RunStateEntry>()

const validResumeStatuses = new Set(['resolved', 'cancelled'])

function validatePendingResumes(
  pending: Array<InterruptRecord>,
  resume: Array<RunAgentResumeItem> | undefined,
): Map<string, RunAgentResumeItem> {
  const pendingInterruptIds = new Set(
    pending.map((interrupt) => interrupt.interruptId),
  )
  const resumeByInterruptId = new Map(
    (resume ?? []).map((entry) => [entry.interruptId, entry]),
  )
  if (pending.length === 0) {
    const staleEntry = resume?.[0]
    if (staleEntry) {
      throw new Error(
        `Resume entry references non-pending interrupt ${staleEntry.interruptId}.`,
      )
    }
    return resumeByInterruptId
  }
  if (!resume || resume.length === 0) {
    throw new Error(
      `Thread has pending interrupts; resume is required before accepting new input.`,
    )
  }

  for (const interrupt of pending) {
    const entry = resumeByInterruptId.get(interrupt.interruptId)
    if (!entry) {
      throw new Error(
        `Missing resume entry for pending interrupt ${interrupt.interruptId}.`,
      )
    }
    if (!validResumeStatuses.has(entry.status)) {
      throw new Error(
        `Invalid resume status for pending interrupt ${interrupt.interruptId}: ${entry.status}.`,
      )
    }
  }
  for (const entry of resume) {
    if (!pendingInterruptIds.has(entry.interruptId)) {
      throw new Error(
        `Resume entry references non-pending interrupt ${entry.interruptId}.`,
      )
    }
  }
  return resumeByInterruptId
}

async function applyPendingResumes(
  pending: Array<InterruptRecord>,
  resumeByInterruptId: Map<string, RunAgentResumeItem>,
  interrupts: NonNullable<AIPersistence['stores']['interrupts']>,
): Promise<void> {
  for (const interrupt of pending) {
    const entry = resumeByInterruptId.get(interrupt.interruptId)
    if (!entry) continue
    if (entry.status === 'resolved') {
      await interrupts.resolve(interrupt.interruptId, entry.payload)
    } else {
      await interrupts.cancel(interrupt.interruptId)
    }
  }
}

/**
 * Commit the resumes stashed in `onConfig`, marking each resumed interrupt
 * resolved/cancelled. Called only from success boundaries (`onFinish`, and the
 * `onChunk` interrupt boundary) so a provider failure or abort between accepting
 * the resume and reaching a boundary leaves the interrupts pending — the
 * approval is not consumed and a retry with the same resume succeeds. Idempotent
 * and a no-op when nothing is stashed.
 */
async function commitPendingResumes(
  state: RunStateEntry | undefined,
  interrupts: AIPersistence['stores']['interrupts'],
): Promise<void> {
  if (!state?.pendingResumes || !interrupts) return
  const { pending, resumeByInterruptId } = state.pendingResumes
  state.pendingResumes = undefined
  await applyPendingResumes(pending, resumeByInterruptId, interrupts)
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function stringField(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  return typeof value[key] === 'string' ? value[key] : undefined
}

function interruptKind(interrupt: InterruptRecord): string | undefined {
  const metadata = objectValue(interrupt.payload.metadata)
  return metadata ? stringField(metadata, 'kind') : undefined
}

function resolvedApprovalDecision(entry: RunAgentResumeItem): boolean {
  if (entry.status === 'cancelled') return false
  const payload = objectValue(entry.payload)
  // Fail closed: persisted resume payloads may be malformed or truncated, so a
  // missing/non-boolean `approved` denies the tool rather than running it.
  return typeof payload?.approved === 'boolean' ? payload.approved : false
}

function resumeToolStateFromPending(
  pending: Array<InterruptRecord>,
  resumeByInterruptId: Map<string, RunAgentResumeItem>,
): ChatResumeToolState | undefined {
  const approvals = new Map<string, boolean>()
  const clientToolResults = new Map<string, unknown>()

  for (const interrupt of pending) {
    const entry = resumeByInterruptId.get(interrupt.interruptId)
    if (!entry) continue

    const kind = interruptKind(interrupt)
    const reason = stringField(interrupt.payload, 'reason')
    const toolCallId = stringField(interrupt.payload, 'toolCallId')

    if (kind === 'approval' || reason === 'approval_required') {
      approvals.set(interrupt.interruptId, resolvedApprovalDecision(entry))
      continue
    }

    if (
      entry.status === 'resolved' &&
      toolCallId &&
      (kind === 'client_tool' || reason === 'client_tool_input')
    ) {
      clientToolResults.set(toolCallId, entry.payload)
    }
  }

  if (approvals.size === 0 && clientToolResults.size === 0) return undefined
  return { approvals, clientToolResults }
}

function interruptPayload(interrupt: unknown): Record<string, unknown> {
  return interrupt && typeof interrupt === 'object'
    ? { ...(interrupt as Record<string, unknown>) }
    : { value: interrupt }
}

// ---------------------------------------------------------------------------
// Shared store / feature plan
// ---------------------------------------------------------------------------

interface PersistencePlan {
  wantsMessages: boolean
  wantsInterrupts: boolean
  wantsLocks: boolean
  runs: AIPersistence['stores']['runs']
}

function resolvePersistencePlan(persistence: AIPersistence): PersistencePlan {
  return {
    wantsMessages: persistence.stores.messages !== undefined,
    wantsInterrupts: persistence.stores.interrupts !== undefined,
    wantsLocks: persistence.stores.locks !== undefined,
    runs: persistence.stores.runs,
  }
}

type StoreIsDefinitelyPresent<
  TStores extends AIPersistenceStores,
  TKey extends keyof AIPersistenceStores,
> = TKey extends keyof TStores
  ? object extends Pick<TStores, TKey>
    ? false
    : [Exclude<TStores[TKey], undefined>] extends [never]
      ? false
      : true
  : false

type StoreIsDefinitelyAbsent<
  TStores extends AIPersistenceStores,
  TKey extends keyof AIPersistenceStores,
> = TKey extends keyof TStores
  ? [Exclude<TStores[TKey], undefined>] extends [never]
    ? true
    : false
  : true

type InvalidChatPersistence<TStores extends AIPersistenceStores> =
  StoreIsDefinitelyPresent<TStores, 'interrupts'> extends true
    ? StoreIsDefinitelyAbsent<TStores, 'runs'>
    : false

type ValidChatPersistence<TStores extends AIPersistenceStores> =
  InvalidChatPersistence<TStores> extends true ? never : unknown

async function createOrResumeRun(
  runs: RunStore | undefined,
  runId: string,
  threadId: string,
): Promise<void> {
  await runs?.createOrResume({
    runId,
    threadId,
    startedAt: Date.now(),
  })
}

async function completeRun(
  runs: RunStore | undefined,
  runId: string,
  usage?: TokenUsage,
): Promise<void> {
  await runs?.update(runId, {
    status: 'completed',
    finishedAt: Date.now(),
    ...(usage ? { usage } : {}),
  })
}

async function failRun(
  runs: RunStore | undefined,
  runId: string,
  error: unknown,
): Promise<void> {
  await runs?.update(runId, {
    status: 'failed',
    finishedAt: Date.now(),
    error: error instanceof Error ? error.message : String(error),
  })
}

async function interruptRun(
  runs: RunStore | undefined,
  runId: string,
): Promise<void> {
  await runs?.update(runId, {
    status: 'interrupted',
    finishedAt: Date.now(),
  })
}

// ---------------------------------------------------------------------------
// Chat middleware
// ---------------------------------------------------------------------------

/**
 * Chat-only persistence middleware. Provides durable **state** for `chat()`:
 * thread messages, run records, interrupts, and locks. This middleware never
 * mutates the chunk stream; delivery durability (replaying a
 * disconnected/reloaded stream) is a separate transport-layer concern tracked
 * in PR #955.
 *
 * ⚠️ AUTHORITATIVE-HISTORY CONTRACT: when a request carries a non-empty
 * `messages` array it is treated as the FULL conversation history and, on
 * finish, **overwrites** the entire stored thread. Post only the complete
 * transcript, never a delta — sending just the newest message(s) will replace
 * (and thereby destroy) the stored thread. To continue a stored thread without
 * resending history, pass an empty `messages` array and the stored transcript
 * is loaded and used.
 */
export function withChatPersistence<TStores extends AIPersistenceStores>(
  persistence: AIPersistence<TStores> & ValidChatPersistence<TStores>,
): ChatMiddleware
export function withChatPersistence(
  persistence: AIPersistence,
): ChatMiddleware {
  validateChatPersistenceStores(persistence)
  const plan = resolvePersistencePlan(persistence)
  const { wantsMessages, wantsInterrupts, wantsLocks, runs } = plan

  const provides = [
    PersistenceCapability,
    ...(wantsInterrupts ? [InterruptsCapability] : []),
    ...(wantsLocks ? [LocksCapability] : []),
  ]

  return defineChatMiddleware({
    name: 'chat-persistence',
    provides,
    setup(ctx: ChatMiddlewareContext) {
      providePersistence(ctx, persistence)

      runState.set(ctx, {
        merged: false,
        interrupted: false,
      })

      if (wantsInterrupts && persistence.stores.interrupts) {
        provideInterrupts(ctx, persistence.stores.interrupts)
      }
      if (wantsLocks && persistence.stores.locks) {
        provideLocks(ctx, persistence.stores.locks)
      }
    },

    async onConfig(ctx: ChatMiddlewareContext, config: ChatMiddlewareConfig) {
      if (ctx.phase !== 'init') return

      let resumeToolState: ChatResumeToolState | undefined

      if (wantsInterrupts && persistence.stores.interrupts) {
        const pending = await persistence.stores.interrupts.listPending(
          ctx.threadId,
        )
        const resumeByInterruptId = validatePendingResumes(
          pending,
          config.resume,
        )
        resumeToolState = resumeToolStateFromPending(
          pending,
          resumeByInterruptId,
        )
        // Defer marking these interrupts resolved/cancelled until the run
        // succeeds (see commitPendingResumes). Committing here would consume the
        // approval even if the run then failed, breaking a retry.
        const state = runState.get(ctx)
        if (state && pending.length > 0) {
          state.pendingResumes = { pending, resumeByInterruptId }
        }
      }

      await createOrResumeRun(runs, ctx.runId, ctx.threadId)

      if (!wantsMessages || !persistence.stores.messages) {
        return resumeToolState ? { resumeToolState } : undefined
      }
      const state = runState.get(ctx)
      if (state?.merged) {
        return resumeToolState ? { resumeToolState } : undefined
      }
      if (state) state.merged = true

      const stored = await persistence.stores.messages.loadThread(ctx.threadId)
      const merged = config.messages.length > 0 ? config.messages : stored
      return {
        messages: merged,
        ...(resumeToolState ? { resumeToolState } : {}),
      }
    },

    async onChunk(ctx: ChatMiddlewareContext, chunk: StreamChunk) {
      // State-only: react to the interrupt boundary (create interrupt records,
      // mark the run interrupted, snapshot thread messages). The chunk stream is
      // never mutated — delivery durability is a transport-layer concern.
      if (
        chunk.type !== 'RUN_FINISHED' ||
        chunk.outcome?.type !== 'interrupt'
      ) {
        return
      }
      const state = runState.get(ctx)
      if (!state) return

      if (wantsInterrupts && persistence.stores.interrupts) {
        // The run reached a new interrupt boundary, so the resumes it consumed
        // are committed before the fresh interrupts are recorded.
        await commitPendingResumes(state, persistence.stores.interrupts)
        for (const interrupt of chunk.outcome.interrupts) {
          await persistence.stores.interrupts.create({
            interruptId: interrupt.id,
            runId: ctx.runId,
            threadId: ctx.threadId,
            requestedAt: Date.now(),
            payload: interruptPayload(interrupt),
          })
        }
      }
      await interruptRun(runs, ctx.runId)
      if (wantsMessages && persistence.stores.messages) {
        await persistence.stores.messages.saveThread(ctx.threadId, [
          ...ctx.messages,
        ])
      }
      state.interrupted = true
    },

    async onFinish(ctx: ChatMiddlewareContext, info: FinishInfo) {
      const state = runState.get(ctx)
      if (state?.interrupted) return
      // The run completed successfully, so commit the resumes it consumed.
      await commitPendingResumes(state, persistence.stores.interrupts)
      await completeRun(runs, ctx.runId, info.usage)
      if (wantsMessages && persistence.stores.messages) {
        await persistence.stores.messages.saveThread(ctx.threadId, [
          ...ctx.messages,
        ])
      }
    },

    async onError(ctx: ChatMiddlewareContext, info: ErrorInfo) {
      await failRun(runs, ctx.runId, info.error)
    },

    async onAbort(ctx: ChatMiddlewareContext, _info: AbortInfo) {
      await interruptRun(runs, ctx.runId)
    },
  })
}

// ---------------------------------------------------------------------------
// Generation middleware
// ---------------------------------------------------------------------------

/**
 * Generation-only persistence middleware. Tracks run status (run records) for
 * image, audio, TTS, video, and transcription activities.
 */
export function withGenerationPersistence<TStores extends AIPersistenceStores>(
  persistence: AIPersistence<TStores>,
): GenerationMiddleware
export function withGenerationPersistence(
  persistence: AIPersistence,
): GenerationMiddleware {
  validatePersistenceStoreKeys(persistence)
  const { runs } = resolvePersistencePlan(persistence)

  return {
    name: 'generation-persistence',

    async onStart(ctx: GenerationMiddlewareContext) {
      await createOrResumeRun(
        runs,
        ctx.runId ?? ctx.requestId,
        ctx.threadId ?? ctx.requestId,
      )
    },

    async onFinish(
      ctx: GenerationMiddlewareContext,
      info: GenerationFinishInfo,
    ) {
      await completeRun(runs, ctx.runId ?? ctx.requestId, info.usage)
    },

    async onError(ctx: GenerationMiddlewareContext, info: GenerationErrorInfo) {
      await failRun(runs, ctx.runId ?? ctx.requestId, info.error)
    },

    async onAbort(
      ctx: GenerationMiddlewareContext,
      _info: GenerationAbortInfo,
    ) {
      await interruptRun(runs, ctx.runId ?? ctx.requestId)
    },
  }
}
