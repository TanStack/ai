import type { LiveRun, RunState, RunStore } from '../types'

export interface InMemoryRunStoreOptions {
  /** TTL in milliseconds. Default 1 hour. */
  ttl?: number
}

/**
 * In-memory RunStore. Holds RunState plus the live generator handle so the
 * engine can resume directly without replaying a step log. Suitable for
 * single-process prototypes.
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
  const expirations = new Map<string, NodeJS.Timeout>()

  function scheduleExpiry(runId: string) {
    const existing = expirations.get(runId)
    if (existing) clearTimeout(existing)
    const handle = setTimeout(() => {
      runs.delete(runId)
      live.delete(runId)
      expirations.delete(runId)
    }, ttl)
    expirations.set(runId, handle)
  }

  return {
    get(runId) {
      return Promise.resolve(runs.get(runId))
    },
    set(runId, state) {
      runs.set(runId, state)
      scheduleExpiry(runId)
      return Promise.resolve()
    },
    delete(runId, _reason) {
      runs.delete(runId)
      live.delete(runId)
      const handle = expirations.get(runId)
      if (handle) clearTimeout(handle)
      expirations.delete(runId)
      return Promise.resolve()
    },
    setLive(runId, l) {
      live.set(runId, l)
    },
    getLive(runId) {
      return live.get(runId)
    },
  }
}
