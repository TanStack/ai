/**
 * Persistence seams for the sandbox layer.
 *
 * These are deliberately pluggable OPTIONAL capabilities so a persistence
 * backend can `provide` durable implementations (D1/Postgres/Durable Objects)
 * without the sandbox layer changing. Do NOT hardcode storage here.
 *
 * The lock primitive (`LockStore` + `InMemoryLockStore`) is re-exported from
 * core `@tanstack/ai` — it is the SAME token `@tanstack/ai-persistence` provides,
 * so a distributed lock supplied by a persistence middleware reaches
 * `withSandbox` transparently. The `SandboxStore` contract stays owned here.
 */
export { InMemoryLockStore } from '@tanstack/ai'
export type { LockStore } from '@tanstack/ai'

/** One persisted sandbox instance, keyed by the compound sandbox instance key. */
export interface SandboxRecord {
  /** Compound key (see computeSandboxKey). */
  key: string
  /** Provider name that owns `providerSandboxId`. */
  provider: string
  /** Provider-assigned sandbox id used to resume. */
  providerSandboxId: string
  /** Most recent snapshot id, when the provider supports snapshots. */
  latestSnapshotId?: string
  threadId: string
  latestRunId?: string
  /** Epoch ms of last write (for keepAlive / GC by the persistence layer). */
  updatedAt: number
}

/** Maps a compound key to the provider sandbox that should be resumed. */
export interface SandboxStore {
  get: (key: string) => Promise<SandboxRecord | null>
  upsert: (record: SandboxRecord) => Promise<void>
  delete: (key: string) => Promise<void>
}

/** In-memory {@link SandboxStore}. Resume works only within one process. */
export class InMemorySandboxStore implements SandboxStore {
  private readonly map = new Map<string, SandboxRecord>()

  get(key: string): Promise<SandboxRecord | null> {
    return Promise.resolve(this.map.get(key) ?? null)
  }

  upsert(record: SandboxRecord): Promise<void> {
    this.map.set(record.key, record)
    return Promise.resolve()
  }

  delete(key: string): Promise<void> {
    this.map.delete(key)
    return Promise.resolve()
  }
}
