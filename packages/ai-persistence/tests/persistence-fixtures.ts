import type {
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunRecord,
  RunStore,
} from '../src'

export function createMessageStore(
  onSave?: (threadId: string) => void,
): MessageStore {
  return {
    loadThread: () => Promise.resolve([]),
    saveThread: (threadId) => {
      onSave?.(threadId)
      return Promise.resolve()
    },
  }
}

export function createRunStore(): RunStore {
  const runs = new Map<string, RunRecord>()
  return {
    createOrResume: (input) => {
      const existing = runs.get(input.runId)
      if (existing) return Promise.resolve(existing)
      const record: RunRecord = {
        runId: input.runId,
        threadId: input.threadId,
        status: input.status ?? 'running',
        startedAt: input.startedAt,
      }
      runs.set(record.runId, record)
      return Promise.resolve(record)
    },
    update: (runId, patch) => {
      const existing = runs.get(runId)
      if (existing) runs.set(runId, { ...existing, ...patch })
      return Promise.resolve()
    },
    get: (runId) => Promise.resolve(runs.get(runId) ?? null),
  }
}

export function createInterruptStore(): InterruptStore {
  return {
    create: () => Promise.resolve(),
    resolve: () => Promise.resolve(),
    cancel: () => Promise.resolve(),
    get: () => Promise.resolve(null),
    list: () => Promise.resolve([]),
    listPending: () => Promise.resolve([]),
    listByRun: () => Promise.resolve([]),
    listPendingByRun: () => Promise.resolve([]),
  }
}

export function createMetadataStore(): MetadataStore {
  return {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve(),
    delete: () => Promise.resolve(),
  }
}
