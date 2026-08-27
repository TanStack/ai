import { createCapability } from '@tanstack/ai'

/** One persisted sandbox instance, keyed by the compound sandbox instance key. */
export interface SandboxInstanceRecord {
  /** Compound key (see `computeSandboxKey`). */
  key: string
  /** Provider name that owns `providerSandboxId`. */
  provider: string
  /** Provider-assigned sandbox id used to resume. */
  providerSandboxId: string
  /** Most recent snapshot id, when the provider supports snapshots. */
  latestSnapshotId?: string
  threadId: string
  latestRunId?: string
  updatedAt: number
}

export interface SandboxInstanceStore {
  get: (key: string) => Promise<SandboxInstanceRecord | null>
  upsert: (record: SandboxInstanceRecord) => Promise<void>
  delete: (key: string) => Promise<void>
}

export function defineSandboxInstanceStore(
  store: SandboxInstanceStore,
): SandboxInstanceStore {
  return store
}

export const SandboxInstanceStoreCapability =
  createCapability<SandboxInstanceStore>()('sandbox-instance-store')

/** Destructured accessors: `getSandboxInstanceStore` / `provideSandboxInstanceStore`. */
export const [getSandboxInstanceStore, provideSandboxInstanceStore] =
  SandboxInstanceStoreCapability

/** In-memory {@link SandboxInstanceStore}. Resume works only within one process. */
export class InMemorySandboxInstanceStore implements SandboxInstanceStore {
  private readonly map = new Map<string, SandboxInstanceRecord>()

  get(key: string): Promise<SandboxInstanceRecord | null> {
    return Promise.resolve(this.map.get(key) ?? null)
  }

  upsert(record: SandboxInstanceRecord): Promise<void> {
    this.map.set(record.key, record)
    return Promise.resolve()
  }

  delete(key: string): Promise<void> {
    this.map.delete(key)
    return Promise.resolve()
  }
}
