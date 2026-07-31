import type {
  GenerationRunRecord,
  GenerationRunStore,
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
    findActiveRun: (threadId) => {
      const active = [...runs.values()]
        .filter((run) => run.threadId === threadId && run.status === 'running')
        .sort((a, b) => b.startedAt - a.startedAt)
      return Promise.resolve(active[0] ?? null)
    },
  }
}

export function createGenerationRunStore(): GenerationRunStore {
  const generationRuns = new Map<string, GenerationRunRecord>()
  return {
    createOrResume: (input) => {
      const existing = generationRuns.get(input.runId)
      if (existing) return Promise.resolve(existing)
      const record: GenerationRunRecord = {
        runId: input.runId,
        threadId: input.threadId,
        activity: input.activity,
        provider: input.provider,
        model: input.model,
        status: input.status ?? 'running',
        startedAt: input.startedAt,
      }
      generationRuns.set(record.runId, record)
      return Promise.resolve(record)
    },
    update: (runId, patch) => {
      const existing = generationRuns.get(runId)
      if (existing) generationRuns.set(runId, { ...existing, ...patch })
      return Promise.resolve()
    },
    get: (runId) => Promise.resolve(generationRuns.get(runId) ?? null),
    findLatestForThread: (threadId) => {
      const linked = [...generationRuns.values()]
        .filter((run) => run.threadId === threadId)
        .sort((a, b) => b.startedAt - a.startedAt)
      return Promise.resolve(linked[0] ?? null)
    },
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
