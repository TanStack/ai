import type { Keyring } from './keyring'

/**
 * A client-side persistence strategy for the keyring. Methods may be sync or
 * async so a strategy backed by async crypto (e.g. the passkey/PRF strategy)
 * fits the same interface as the synchronous ones.
 */
export interface KeyringStorage {
  /** A stable id for the strategy, surfaced in UI. */
  readonly id: string
  /** Human-readable label. */
  readonly label: string
  /** Whether keys written here survive a page refresh. `false` for memory. */
  readonly persistent: boolean
  /**
   * Whether this strategy requires an explicit unlock ceremony (e.g. a
   * biometric tap) before stored keys can be read. When `true`, `<ByokProvider>`
   * does not auto-load on mount — it waits for `unlock()`.
   */
  readonly unlockable?: boolean
  /**
   * An honest, storage-specific caveat rendered by `<ByokKeyManager>` while this
   * strategy is active (e.g. "protects at rest, not against in-page attacks").
   */
  readonly warning?: string
  readonly load: () => Promise<Keyring> | Keyring
  readonly save: (keys: Keyring) => Promise<void> | void
  readonly clear: () => Promise<void> | void
}

/**
 * The default: session / in-memory. Keys live only in React state and vanish on
 * refresh. Persists nothing, so it holds no state of its own — `load` always
 * returns an empty keyring. Zero at-rest liability.
 */
export function memoryStorage(): KeyringStorage {
  return {
    id: 'memory',
    label: 'Session only (not saved)',
    persistent: false,
    load: () => ({}),
    save: () => {},
    clear: () => {},
  }
}
