import type { Keyring } from './keyring'
import type { ProviderId } from '../shared/providers'

/**
 * Non-sensitive presence metadata: `provider → last 4 chars` of a stored key.
 * Never contains the full key.
 */
export type KeyPreview = Partial<Record<ProviderId, string>>

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
  /**
   * Report which providers have a stored key, and each key's last 4 chars,
   * WITHOUT decrypting or running an unlock ceremony. Lets the UI surface saved
   * keys as "locked" immediately after a refresh, before the user unlocks. Omit
   * when not applicable (e.g. memory, which persists nothing).
   */
  readonly peek?: () => Promise<KeyPreview> | KeyPreview
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
