import { LogConflictError } from '../types'
import type { LiveRun, RunState, RunStore, StepRecord } from '../types'

export interface InMemoryRunStoreOptions {
  /** TTL in milliseconds. Default 1 hour. */
  ttl?: number
}

/**
 * In-memory RunStore. Holds RunState plus the per-run append-only step
 * log so the engine can replay across a process restart within the same
 * heap, and stashes the live generator handle alongside so single-node
 * resumes don't have to reconstruct from the log. Suitable for
 * single-process prototypes and the test suite.
 */
export interface InMemoryRunStore extends RunStore {
  /** Engine-only: stash the live generator handle alongside the run state. */
  setLive: (runId: string, live: LiveRun) => void
  /** Engine-only: retrieve the live generator handle. */
  getLive: (runId: string) => LiveRun | undefined
}

export function inMemoryRunStore(
  options: InMemoryRunStoreOptions = {},
): InMemoryRunStore {
  const ttl = options.ttl ?? 60 * 60 * 1000
  const runs = new Map<string, RunState>()
  const live = new Map<string, LiveRun>()
  const stepLogs = new Map<string, Array<StepRecord>>()
  const expirations = new Map<string, NodeJS.Timeout>()

  function scheduleExpiry(runId: string, state?: RunState) {
    const existing = expirations.get(runId)
    if (existing) clearTimeout(existing)
    // Don't expire paused runs from underneath the engine. A run that
    // pauses on a long-running `waitForSignal` / `sleep` (deadline >
    // ttl) is intentional persistence — the host owns cleanup via
    // `deleteRun` and the engine calls `deleteRun` automatically on
    // finish / error / abort.
    if (state?.status === 'paused') return
    const handle = setTimeout(() => {
      runs.delete(runId)
      live.delete(runId)
      stepLogs.delete(runId)
      expirations.delete(runId)
    }, ttl)
    expirations.set(runId, handle)
  }

  return {
    // ── state ─────────────────────────────────────────────────────────
    getRunState(runId) {
      return Promise.resolve(runs.get(runId))
    },
    setRunState(runId, state) {
      runs.set(runId, state)
      scheduleExpiry(runId, state)
      return Promise.resolve()
    },
    deleteRun(runId, _reason) {
      // If a live run handle is still around (paused on approval / signal /
      // sleep), abort it and reject any pending approval resolver before
      // dropping the entry. Without this, callers awaiting the resolver
      // promise or the engine's generator continuation hang forever after
      // the run record disappears.
      const liveRun = live.get(runId)
      if (liveRun) {
        try {
          liveRun.abortController.abort()
        } catch {
          // Aborting an already-aborted controller is a no-op in the
          // standard but defensive callers may throw — swallow so cleanup
          // can complete.
        }
        if (liveRun.approvalResolver) {
          try {
            // Synthesizing a rejection-style "approved=false" lets any
            // awaiter resolve cleanly rather than hanging. Hosts that
            // care about reason can read the run state's status.
            liveRun.approvalResolver({
              approvalId: liveRun.pendingApprovalStepId ?? '',
              approved: false,
              feedback: 'run deleted before approval resolved',
            })
          } catch {
            // Resolver may already have been invoked.
          }
        }
      }
      runs.delete(runId)
      live.delete(runId)
      stepLogs.delete(runId)
      const handle = expirations.get(runId)
      if (handle) clearTimeout(handle)
      expirations.delete(runId)
      return Promise.resolve()
    },

    // ── step log (CAS append + ordered read) ──────────────────────────
    appendStep(runId, expectedNextIndex, record) {
      const log = stepLogs.get(runId) ?? []
      if (log.length !== expectedNextIndex) {
        // Another writer slipped in; let the engine decide whether to
        // treat the existing entry as an idempotent retry (same
        // signalId) or as a lost race (different signalId).
        return Promise.reject(
          new LogConflictError(
            runId,
            expectedNextIndex,
            log[expectedNextIndex],
          ),
        )
      }
      // Record's index field is normalized to the actual position so
      // callers can construct partial records without worrying about
      // staying in sync with the log.
      log.push({ ...record, index: expectedNextIndex })
      stepLogs.set(runId, log)
      scheduleExpiry(runId, runs.get(runId))
      return Promise.resolve()
    },
    getSteps(runId) {
      // Return a stable snapshot — callers must not mutate, but a fresh
      // copy prevents accidental aliasing across awaits.
      const log = stepLogs.get(runId)
      return Promise.resolve(log ? [...log] : [])
    },

    // ── engine-internal LiveRun cache ─────────────────────────────────
    setLive(runId, l) {
      live.set(runId, l)
    },
    getLive(runId) {
      return live.get(runId)
    },
  }
}
