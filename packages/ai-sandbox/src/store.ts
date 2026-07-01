/**
 * Persistence seams for the sandbox layer.
 *
 * v1 ships ONLY in-memory implementations (single-process resume). These are
 * deliberately pluggable OPTIONAL capabilities so the future persistence
 * package can `provide` durable implementations (D1/Postgres/Durable Objects)
 * without the sandbox layer changing. Do NOT hardcode storage here.
 */

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

/**
 * Mutual exclusion around sandbox ensure so two concurrent runs for the same
 * thread don't both create a sandbox. The in-memory default is single-process;
 * the persistence layer provides a distributed lock (e.g. a Durable Object).
 */
export interface LockStore {
  withLock: <T>(key: string, fn: () => Promise<T>) => Promise<T>
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

/**
 * In-memory {@link LockStore} — a per-key promise chain. Correct within a
 * single process; multi-instance correctness needs a distributed lock from the
 * persistence layer.
 */
export class InMemoryLockStore implements LockStore {
  private readonly chains = new Map<string, Promise<unknown>>()

  withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.chains.get(key) ?? Promise.resolve()
    // Chain after the prior holder regardless of how it settled.
    const run = prior.then(fn, fn)
    // Keep the chain alive but swallow rejections so one failure doesn't poison the lock.
    this.chains.set(
      key,
      run.then(
        () => undefined,
        () => undefined,
      ),
    )
    return run
  }
}
