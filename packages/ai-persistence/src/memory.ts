import { InMemoryLockStore } from './locks'
import { defineAIPersistence } from './types'
import type { LockStore } from './locks'
import type { ModelMessage } from '@tanstack/ai'
import type {
  InterruptRecord,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunRecord,
  RunStore,
} from './types'

class MemoryMessageStore implements MessageStore {
  private readonly threads = new Map<string, Array<ModelMessage>>()
  loadThread(threadId: string): Promise<Array<ModelMessage>> {
    return Promise.resolve(this.threads.get(threadId)?.slice() ?? [])
  }
  saveThread(threadId: string, messages: Array<ModelMessage>): Promise<void> {
    this.threads.set(threadId, messages.slice())
    return Promise.resolve()
  }
}

class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, RunRecord>()
  createOrResume(input: {
    runId: string
    threadId: string
    status?: RunRecord['status']
    startedAt: number
  }): Promise<RunRecord> {
    const existing = this.runs.get(input.runId)
    if (existing) return Promise.resolve(existing)
    const record: RunRecord = {
      runId: input.runId,
      threadId: input.threadId,
      status: input.status ?? 'running',
      startedAt: input.startedAt,
    }
    this.runs.set(record.runId, record)
    return Promise.resolve(record)
  }
  update(
    runId: string,
    patch: Partial<
      Pick<RunRecord, 'status' | 'finishedAt' | 'error' | 'usage'>
    >,
  ): Promise<void> {
    const existing = this.runs.get(runId)
    if (existing) this.runs.set(runId, { ...existing, ...patch })
    return Promise.resolve()
  }
  get(runId: string): Promise<RunRecord | null> {
    return Promise.resolve(this.runs.get(runId) ?? null)
  }
}

function byRequestedAt(a: InterruptRecord, b: InterruptRecord): number {
  return a.requestedAt - b.requestedAt
}

class MemoryInterruptStore implements InterruptStore {
  private readonly interrupts = new Map<string, InterruptRecord>()
  create(
    record: Omit<InterruptRecord, 'status' | 'resolvedAt'>,
  ): Promise<void> {
    // Insert-if-absent (canonical semantics, matching the SQL backends'
    // ON CONFLICT DO NOTHING): a duplicate id must never clobber an existing —
    // possibly already resolved — interrupt back to pending.
    if (!this.interrupts.has(record.interruptId)) {
      this.interrupts.set(record.interruptId, { ...record, status: 'pending' })
    }
    return Promise.resolve()
  }
  resolve(interruptId: string, response?: unknown): Promise<void> {
    const existing = this.interrupts.get(interruptId)
    if (existing) {
      this.interrupts.set(interruptId, {
        ...existing,
        status: 'resolved',
        resolvedAt: Date.now(),
        response,
      })
    }
    return Promise.resolve()
  }
  cancel(interruptId: string): Promise<void> {
    const existing = this.interrupts.get(interruptId)
    if (existing) {
      this.interrupts.set(interruptId, {
        ...existing,
        status: 'cancelled',
        resolvedAt: Date.now(),
      })
    }
    return Promise.resolve()
  }
  get(interruptId: string): Promise<InterruptRecord | null> {
    return Promise.resolve(this.interrupts.get(interruptId) ?? null)
  }
  list(threadId: string): Promise<Array<InterruptRecord>> {
    return Promise.resolve(
      [...this.interrupts.values()]
        .filter((interrupt) => interrupt.threadId === threadId)
        .sort(byRequestedAt),
    )
  }
  listPending(threadId: string): Promise<Array<InterruptRecord>> {
    return Promise.resolve(
      [...this.interrupts.values()]
        .filter(
          (interrupt) =>
            interrupt.threadId === threadId && interrupt.status === 'pending',
        )
        .sort(byRequestedAt),
    )
  }
  listByRun(runId: string): Promise<Array<InterruptRecord>> {
    return Promise.resolve(
      [...this.interrupts.values()]
        .filter((interrupt) => interrupt.runId === runId)
        .sort(byRequestedAt),
    )
  }
  listPendingByRun(runId: string): Promise<Array<InterruptRecord>> {
    return Promise.resolve(
      [...this.interrupts.values()]
        .filter(
          (interrupt) =>
            interrupt.runId === runId && interrupt.status === 'pending',
        )
        .sort(byRequestedAt),
    )
  }
}

class MemoryMetadataStore implements MetadataStore {
  // Nested maps so composite identity is `(namespace, key)` without the
  // `${namespace}:${key}` collision where `('a:b','c')` aliases `('a','b:c')`.
  // (This parameter is an app-defined metadata namespace string — not the
  // shared `Scope` identity type from `@tanstack/ai`.)
  private readonly values = new Map<string, Map<string, unknown>>()
  get(namespace: string, key: string): Promise<unknown | null> {
    const bucket = this.values.get(namespace)
    if (!bucket || !bucket.has(key)) return Promise.resolve(null)
    return Promise.resolve(bucket.get(key))
  }
  set(namespace: string, key: string, value: unknown): Promise<void> {
    let bucket = this.values.get(namespace)
    if (!bucket) {
      bucket = new Map()
      this.values.set(namespace, bucket)
    }
    bucket.set(key, value)
    return Promise.resolve()
  }
  delete(namespace: string, key: string): Promise<void> {
    const bucket = this.values.get(namespace)
    if (!bucket) return Promise.resolve()
    bucket.delete(key)
    if (bucket.size === 0) this.values.delete(namespace)
    return Promise.resolve()
  }
}

interface MemoryPersistenceStores {
  messages: MessageStore
  runs: RunStore
  interrupts: InterruptStore
  metadata: MetadataStore
  locks: LockStore
}

export function memoryPersistence() {
  const stores: MemoryPersistenceStores = {
    messages: new MemoryMessageStore(),
    runs: new MemoryRunStore(),
    interrupts: new MemoryInterruptStore(),
    metadata: new MemoryMetadataStore(),
    locks: new InMemoryLockStore(),
  }
  return defineAIPersistence({ stores })
}
