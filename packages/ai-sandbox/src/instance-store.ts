/**
 * Durable sandbox **instance** map — which provider sandbox (and snapshot) to
 * resume for a compound key. Owned by `@tanstack/ai-sandbox` (not chat
 * persistence): domain is runtime placement for `ensure`, not conversation state.
 *
 * Provide with {@link withSandboxInstanceStore}; {@link withSandbox} consumes
 * the same {@link SandboxInstanceStoreCapability} in `ensure` (in-memory
 * fallback when absent).
 */
import { createCapability, defineChatMiddleware } from '@tanstack/ai'
import type { ChatMiddleware, ChatMiddlewareContext } from '@tanstack/ai'

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
  /**
   * Epoch ms of last write (for keepAlive / GC by the host app).
   */
  updatedAt: number
}

/**
 * Maps a compound key to the provider sandbox that should be resumed.
 *
 * Implement against your own database (BYO). Prove the contract with
 * `runSandboxInstanceStoreConformance` from `@tanstack/ai-sandbox/testkit`.
 */
export interface SandboxInstanceStore {
  /**
   * Return the record for `key`, or `null` if none exists.
   *
   * INVARIANT: missing keys return `null` (never throw).
   */
  get: (key: string) => Promise<SandboxInstanceRecord | null>
  /**
   * Insert or fully replace the record for `record.key`.
   *
   * INVARIANT (full replace): omitted optional fields (`latestSnapshotId`,
   * `latestRunId`) MUST clear any previously stored values. Do not merge with
   * the prior row — a create-without-snapshot path must not leave a stale
   * snapshot id.
   */
  upsert: (record: SandboxInstanceRecord) => Promise<void>
  /**
   * Remove the record for `key`.
   *
   * INVARIANT: deleting a missing key is a **no-op** (must not throw).
   */
  delete: (key: string) => Promise<void>
}

/**
 * Capability for the instance map. Provided by {@link withSandboxInstanceStore};
 * consumed by {@link withSandbox}.
 */
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

/**
 * Provide a durable {@link SandboxInstanceStore} on the chat capability bus so
 * later {@link withSandbox} can resume across processes.
 *
 * Compose **before** `withSandbox`. Independent of chat state persistence —
 * pair with `withPersistence` only if the app also needs transcript durability.
 *
 * ```ts
 * middleware: [
 *   withSandboxInstanceStore(instanceStore),
 *   withLocks(locks), // from @tanstack/ai — multi-instance
 *   withSandbox(sandbox),
 * ]
 * ```
 */
export function withSandboxInstanceStore(
  store: SandboxInstanceStore,
): ChatMiddleware {
  return defineChatMiddleware({
    name: 'sandbox-instance-store',
    provides: [SandboxInstanceStoreCapability],
    setup(ctx: ChatMiddlewareContext) {
      provideSandboxInstanceStore(ctx, store)
    },
  })
}
