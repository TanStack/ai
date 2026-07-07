import type { Keyring } from './keyring'

/**
 * A client-side persistence strategy for the keyring. Methods may be sync or
 * async so a strategy backed by async crypto (e.g. a future passkey/PRF
 * strategy) fits the same interface as the synchronous ones.
 */
export interface KeyringStorage {
  /** A stable id for the strategy, surfaced in UI. */
  readonly id: string
  /** Human-readable label. */
  readonly label: string
  /**
   * Whether keys written here survive a page refresh. `false` for the default
   * memory storage; UI uses this to decide whether to show a persistence
   * warning.
   */
  readonly persistent: boolean
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

/**
 * Opt-in: `localStorage`, **plaintext — keys are NOT encrypted**. Convenient
 * across refreshes, but readable by any XSS or browser extension on the origin.
 * `<ByokKeyManager>` surfaces a warning while this storage is active (it is
 * marked `persistent`). Use only when the convenience is worth that exposure;
 * an encrypted-at-rest option is planned as a follow-up.
 */
export function localStorageStorage(
  storageKey = 'tanstack-byok',
): KeyringStorage {
  const store = (): Storage | null => {
    // `localStorage` is typed as always-present via the DOM lib, but is absent
    // in SSR / Node and can throw in sandboxed frames — guard at runtime.
    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      return globalThis.localStorage ?? null
    } catch {
      return null
    }
  }

  return {
    id: 'localStorage',
    label: 'This browser (localStorage, plaintext)',
    persistent: true,
    load: () => {
      const raw = store()?.getItem(storageKey)
      if (!raw) return {}
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) return {}
      return parsed
    },
    save: (keys) => {
      store()?.setItem(storageKey, JSON.stringify(keys))
    },
    clear: () => {
      store()?.removeItem(storageKey)
    },
  }
}
