/**
 * `withPersistence` — composable chat() middleware that makes a run durable.
 *
 * Maps onto the real middleware hooks:
 * - `setup`     → create/resume the run record; provide capabilities; seed the
 *                 per-run sequence (continuing past any already-persisted events).
 * - `onConfig`  → (init only) load the thread transcript and make the server
 *                 authoritative: use the client's messages when present, else the
 *                 stored transcript (so a thin/resume request with no messages
 *                 still runs on history).
 * - `onChunk`   → assign the next per-run sequence, stamp the in-band `cursor`,
 *                 append to the event log, publish to the durable stream.
 * - `onFinish`  → mark the run completed, persist usage + the final transcript.
 * - `onError`   → mark the run failed; `onAbort` → interrupted.
 *
 * Everything is gated on the presence of the relevant store, so a `messages`-only
 * persistence is as valid as a full `agent` one, and a non-persisted run is
 * completely unaffected (this middleware simply isn't in the stack).
 *
 * NOTE on message reconciliation: `ModelMessage` has no stable id (ids live on
 * the client `UIMessage` and are stripped before the engine sees messages), so
 * reconciliation is whole-transcript, server-authoritative, not id-level. True
 * id/delta thin-client merging is a documented follow-up.
 */
import { defineChatMiddleware } from '@tanstack/ai'
import {
  ApprovalsCapability,
  EventsCapability,
  LocksCapability,
  PersistenceCapability,
  ResumeSourceCapability,
  provideApprovals,
  provideEvents,
  provideLocks,
  providePersistence,
  provideResumeSource,
} from './capabilities'
import { RunSequence, encodeCursor } from './cursor'
import { createResumeSource } from './resume-source'
import type {
  ChatMiddleware,
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  StreamChunk,
} from '@tanstack/ai'
import type { ChatPersistence, PersistenceMode } from './types'

export interface WithPersistenceOptions {
  /** Override the persistence aggregate's declared mode for this run. */
  mode?: PersistenceMode
}

/** Per-run state, keyed by the stable middleware context. */
const runState = new WeakMap<object, { seq: RunSequence; merged: boolean }>()

export function withPersistence(
  persistence: ChatPersistence,
  opts?: WithPersistenceOptions,
): ChatMiddleware {
  const mode = opts?.mode ?? persistence.mode
  const hasMessages = mode !== 'chat' || !!persistence.messages
  const wantsMessages = !!persistence.messages
  const wantsEvents = mode !== 'messages' && !!persistence.events
  const wantsApprovals = mode === 'agent' && !!persistence.approvals
  const wantsLocks = !!persistence.locks
  void hasMessages

  // Declared provisions must match what setup actually provides (array
  // middleware is runtime-validated for coverage).
  const provides = [
    PersistenceCapability,
    ...(wantsEvents ? [EventsCapability, ResumeSourceCapability] : []),
    ...(wantsApprovals ? [ApprovalsCapability] : []),
    ...(wantsLocks ? [LocksCapability] : []),
  ]

  return defineChatMiddleware({
    name: 'persistence',
    provides,
    async setup(ctx: ChatMiddlewareContext) {
      providePersistence(ctx, persistence)

      if (persistence.runs) {
        await persistence.runs.createOrResume({
          runId: ctx.runId,
          threadId: ctx.threadId,
          startedAt: Date.now(),
        })
      }

      // Continue the sequence past anything already persisted (resume-safe).
      const initialSeq =
        wantsEvents && persistence.events
          ? await persistence.events.latestSeq(ctx.runId)
          : 0
      runState.set(ctx, {
        seq: new RunSequence(ctx.runId, initialSeq),
        merged: false,
      })

      if (wantsEvents && persistence.events) {
        provideEvents(ctx, persistence.events)
        provideResumeSource(
          ctx,
          createResumeSource(persistence.events, persistence.runs),
        )
      }
      if (wantsApprovals && persistence.approvals) {
        provideApprovals(ctx, persistence.approvals)
      }
      if (wantsLocks && persistence.locks) {
        provideLocks(ctx, persistence.locks)
      }
    },

    async onConfig(ctx: ChatMiddlewareContext, config: ChatMiddlewareConfig) {
      if (ctx.phase !== 'init' || !wantsMessages || !persistence.messages) {
        return
      }
      const state = runState.get(ctx)
      if (state?.merged) return
      if (state) state.merged = true

      const stored = await persistence.messages.loadThread(ctx.threadId)
      // Server-authoritative: client messages win when present (full-history
      // client); fall back to stored history for a thin/resume request.
      const merged = config.messages.length > 0 ? config.messages : stored
      return { messages: merged }
    },

    async onChunk(ctx: ChatMiddlewareContext, chunk: StreamChunk) {
      if (!wantsEvents || !persistence.events) return
      const state = runState.get(ctx)
      if (!state) return
      const seq = state.seq.next()
      const stamped: StreamChunk = { ...chunk, cursor: encodeCursor(ctx.runId, seq) }
      await persistence.events.append(ctx.runId, seq, stamped)
      await persistence.stream?.publish(ctx.runId, seq, stamped)
      return stamped
    },

    async onFinish(ctx: ChatMiddlewareContext, info) {
      await persistence.runs?.update(ctx.runId, {
        status: 'completed',
        finishedAt: Date.now(),
        ...(info.usage ? { usage: info.usage } : {}),
      })
      if (wantsMessages && persistence.messages) {
        await persistence.messages.saveThread(ctx.threadId, [...ctx.messages])
      }
    },

    async onError(ctx: ChatMiddlewareContext, info) {
      await persistence.runs?.update(ctx.runId, {
        status: 'failed',
        finishedAt: Date.now(),
        error:
          info.error instanceof Error
            ? info.error.message
            : String(info.error),
      })
    },

    async onAbort(ctx: ChatMiddlewareContext) {
      await persistence.runs?.update(ctx.runId, {
        status: 'interrupted',
        finishedAt: Date.now(),
      })
    },
  })
}
