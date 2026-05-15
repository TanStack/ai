import { LogConflictError } from '../types'
import type {
  LiveRun,
  RunState,
  RunStore,
  StepRecord,
} from '../types'

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

  function scheduleExpiry(runId: string) {
    const existing = expirations.get(runId)
    if (existing) clearTimeout(existing)
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
      scheduleExpiry(runId)
      return Promise.resolve()
    },
    deleteRun(runId, _reason) {
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
          new LogConflictError(runId, expectedNextIndex, log[expectedNextIndex]),
        )
      }
      // Record's index field is normalized to the actual position so
      // callers can construct partial records without worrying about
      // staying in sync with the log.
      log.push({ ...record, index: expectedNextIndex })
      stepLogs.set(runId, log)
      scheduleExpiry(runId)
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
