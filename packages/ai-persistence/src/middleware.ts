import { defineChatMiddleware } from '@tanstack/ai'
import {
  EventsCapability,
  InterruptsCapability,
  LocksCapability,
  PersistenceCapability,
  ResumeSourceCapability,
  provideEvents,
  provideInterrupts,
  provideLocks,
  providePersistence,
  provideResumeSource,
} from './capabilities'
import { RunSequence, decodeCursor, encodeCursor } from './cursor'
import { createResumeSource } from './resume-source'
import { validatePersistenceFeatures } from './types'
import type {
  ChatMiddleware,
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  ChatResumeToolState,
  RunAgentResumeItem,
  StreamChunk,
} from '@tanstack/ai'
import type {
  AIPersistence,
  InterruptRecord,
  PersistenceFeature,
} from './types'

export interface WithPersistenceOptions {
  features?: Array<PersistenceFeature>
}

const runState = new WeakMap<
  object,
  { seq: RunSequence; merged: boolean; interrupted: boolean }
>()

function defaultFeatures(
  persistence: AIPersistence,
): Array<PersistenceFeature> {
  const features: Array<PersistenceFeature> = []
  if (persistence.stores.messages) features.push('messages')
  if (persistence.stores.runs && persistence.stores.publicEvents) {
    features.push('durable-replay')
  }
  if (
    persistence.stores.runs &&
    persistence.stores.publicEvents &&
    persistence.stores.interrupts
  ) {
    features.push('interrupts')
  }
  if (persistence.stores.internalEvents) features.push('internal-events')
  if (persistence.stores.metadata) features.push('metadata')
  if (persistence.stores.locks) features.push('locks')
  if (persistence.stores.artifacts) features.push('artifacts')
  if (persistence.stores.blobs) features.push('blobs')
  return features
}

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
  return typeof payload?.approved === 'boolean' ? payload.approved : true
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

async function publicEventExistsAtSeq(
  publicEvents: NonNullable<AIPersistence['stores']['publicEvents']>,
  runId: string,
  seq: number,
): Promise<boolean> {
  for await (const persisted of publicEvents.read(runId, {
    afterSeq: seq - 1,
  })) {
    return persisted.seq === seq
  }
  return false
}

async function validateReplayCursor(
  ctx: ChatMiddlewareContext,
  cursor: string | undefined,
  persistence: AIPersistence,
): Promise<boolean> {
  if (!cursor) return false
  if (!persistence.stores.runs || !persistence.stores.publicEvents) {
    return false
  }

  const decoded = decodeCursor(cursor)
  if (decoded.seq < 1) {
    throw new Error(
      `Resume cursor sequence ${decoded.seq} is invalid; expected a persisted event sequence >= 1.`,
    )
  }
  if (decoded.runId !== ctx.runId) {
    throw new Error(
      `Resume cursor runId ${decoded.runId} does not match request runId ${ctx.runId}.`,
    )
  }

  const run = await persistence.stores.runs.get(decoded.runId)
  if (!run) {
    throw new Error(`Resume cursor references unknown run ${decoded.runId}.`)
  }
  if (run.threadId !== ctx.threadId) {
    throw new Error(
      `Resume cursor run ${decoded.runId} belongs to thread ${run.threadId}, not request thread ${ctx.threadId}.`,
    )
  }

  const latestSeq = await persistence.stores.publicEvents.latestSeq(
    decoded.runId,
  )
  if (latestSeq === 0) {
    throw new Error(
      `Resume cursor references run ${decoded.runId}, but no public events are persisted.`,
    )
  }
  if (decoded.seq > latestSeq) {
    throw new Error(
      `Resume cursor sequence ${decoded.seq} is beyond latest persisted sequence ${latestSeq} for run ${decoded.runId}.`,
    )
  }
  if (
    !(await publicEventExistsAtSeq(
      persistence.stores.publicEvents,
      decoded.runId,
      decoded.seq,
    ))
  ) {
    throw new Error(
      `Resume cursor sequence ${decoded.seq} does not reference a persisted public event for run ${decoded.runId}.`,
    )
  }

  return true
}

export function withPersistence(
  persistence: AIPersistence,
  opts?: WithPersistenceOptions,
): ChatMiddleware {
  const features = opts?.features ?? defaultFeatures(persistence)
  validatePersistenceFeatures(persistence, features)

  const wantsMessages = features.includes('messages')
  const wantsReplay = features.includes('durable-replay')
  const wantsInterrupts = features.includes('interrupts')
  const wantsPublicEvents = wantsReplay || wantsInterrupts
  const wantsLocks = features.includes('locks')
  const publicEvents = persistence.stores.publicEvents
  const runs = persistence.stores.runs

  const provides = [
    PersistenceCapability,
    ...(wantsPublicEvents ? [EventsCapability, ResumeSourceCapability] : []),
    ...(wantsInterrupts ? [InterruptsCapability] : []),
    ...(wantsLocks ? [LocksCapability] : []),
  ]

  return defineChatMiddleware({
    name: 'persistence',
    provides,
    async setup(ctx: ChatMiddlewareContext) {
      providePersistence(ctx, persistence)

      const initialSeq =
        wantsPublicEvents && publicEvents
          ? await publicEvents.latestSeq(ctx.runId)
          : 0
      runState.set(ctx, {
        seq: new RunSequence(ctx.runId, initialSeq),
        merged: false,
        interrupted: false,
      })

      if (wantsPublicEvents && publicEvents) {
        provideEvents(ctx, publicEvents)
        provideResumeSource(ctx, createResumeSource(publicEvents, runs))
      }
      if (wantsInterrupts && persistence.stores.interrupts) {
        provideInterrupts(ctx, persistence.stores.interrupts)
      }
      if (wantsLocks && persistence.stores.locks) {
        provideLocks(ctx, persistence.stores.locks)
      }
    },

    async onConfig(ctx: ChatMiddlewareContext, config: ChatMiddlewareConfig) {
      if (ctx.phase !== 'init') return

      const hasResume = config.resume !== undefined
      const isReplay = wantsPublicEvents
        ? await validateReplayCursor(ctx, config.cursor, persistence)
        : false
      let resumeToolState: ChatResumeToolState | undefined

      if (
        wantsInterrupts &&
        persistence.stores.interrupts &&
        (!isReplay || hasResume)
      ) {
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
        await applyPendingResumes(
          pending,
          resumeByInterruptId,
          persistence.stores.interrupts,
        )
      }

      if (runs) {
        await runs.createOrResume({
          runId: ctx.runId,
          threadId: ctx.threadId,
          startedAt: Date.now(),
        })
      }

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
      if (!wantsPublicEvents || !publicEvents) return
      const state = runState.get(ctx)
      if (!state) return
      const expectedSeq = state.seq.current()
      const seq = state.seq.next()
      const stamped: StreamChunk = {
        ...chunk,
        cursor: encodeCursor(ctx.runId, seq),
      }
      await publicEvents.append({
        runId: ctx.runId,
        expectedSeq,
        event: stamped,
      })
      await persistence.stream?.publish(ctx.runId, seq, stamped)

      if (
        stamped.type === 'RUN_FINISHED' &&
        stamped.outcome?.type === 'interrupt'
      ) {
        if (wantsInterrupts && persistence.stores.interrupts) {
          for (const interrupt of stamped.outcome.interrupts) {
            await persistence.stores.interrupts.create({
              interruptId: interrupt.id,
              runId: ctx.runId,
              threadId: ctx.threadId,
              status: 'pending',
              requestedAt: Date.now(),
              payload: interruptPayload(interrupt),
            })
          }
        }
        await runs?.update(ctx.runId, {
          status: 'interrupted',
          finishedAt: Date.now(),
        })
        if (wantsMessages && persistence.stores.messages) {
          await persistence.stores.messages.saveThread(ctx.threadId, [
            ...ctx.messages,
          ])
        }
        state.interrupted = true
      }

      return stamped
    },

    async onFinish(ctx: ChatMiddlewareContext, info) {
      if (runState.get(ctx)?.interrupted) return
      await runs?.update(ctx.runId, {
        status: 'completed',
        finishedAt: Date.now(),
        ...(info.usage ? { usage: info.usage } : {}),
      })
      if (wantsMessages && persistence.stores.messages) {
        await persistence.stores.messages.saveThread(ctx.threadId, [
          ...ctx.messages,
        ])
      }
    },

    async onError(ctx: ChatMiddlewareContext, info) {
      await runs?.update(ctx.runId, {
        status: 'failed',
        finishedAt: Date.now(),
        error:
          info.error instanceof Error ? info.error.message : String(info.error),
      })
    },

    async onAbort(ctx: ChatMiddlewareContext) {
      await runs?.update(ctx.runId, {
        status: 'interrupted',
        finishedAt: Date.now(),
      })
    },
  })
}
