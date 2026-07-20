/**
 * Persistence seams for the sandbox layer.
 *
 * v1 ships an in-memory sandbox record store for single-process resume.
 * Durable persistence can be supplied through optional middleware
 * capabilities.
 */

export type { LockStore } from '@tanstack/ai'
export { InMemoryLockStore } from '@tanstack/ai'

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
