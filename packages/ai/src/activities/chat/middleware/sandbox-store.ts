/**
 * Durable sandbox-resume seam — the neutral, shared home for the
 * `'sandbox-store'` capability.
 *
 * Capability identity is by object reference (see `createCapability`), so this
 * ONE `SandboxStoreCapability` is the single token both `@tanstack/ai-persistence`
 * (whose `withPersistence` PROVIDES a durable store) and `@tanstack/ai-sandbox`
 * (whose `withSandbox` CONSUMES it in `ensure`) import and re-export. Defining
 * it here — core, depended on by both and depending on neither — lets a
 * persistence-provided store reach the sandbox layer without either package
 * depending on the other (the same arrangement as the `'locks'` token).
 */
import { createCapability } from './capabilities'

/** One persisted sandbox instance, keyed by the compound sandbox instance key. */
export interface SandboxRecord {
  /** Compound key (see `computeSandboxKey` in `@tanstack/ai-sandbox`). */
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

/**
 * The sandbox-store capability. Provided by `withPersistence` when a `sandbox`
 * store is present; consumed by `withSandbox`.
 */
export const SandboxStoreCapability =
  createCapability<SandboxStore>()('sandbox-store')

/** Destructured accessors: `getSandboxStore(ctx)` / `provideSandboxStore(ctx, store)`. */
export const [getSandboxStore, provideSandboxStore] = SandboxStoreCapability

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
