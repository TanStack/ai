import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { validateKey as pingProvider } from '../client/validate'
import { memoryStorage } from '../client/storage'
import { maskKey } from '../server/scrub'
import { PROVIDER_IDS } from '../shared/providers'
import type { ReactNode } from 'react'
import type { Keyring } from '../client/keyring'
import type { KeyringStorage } from '../client/storage'
import type { ProviderId } from '../shared/providers'
import type { ValidationStatus } from '../client/validate'

/**
 * Per-provider status surfaced to the UI. `masked` never contains more than the
 * last 4 characters — the full key is never rendered back.
 */
export type KeyStatus =
  | { state: 'empty' }
  | { state: 'set'; masked: string }
  | { state: 'validating'; masked: string }
  | { state: ValidationStatus; masked: string }
  | { state: 'error'; masked: string; message: string }

const EMPTY: KeyStatus = { state: 'empty' }

export interface ByokContextValue {
  /**
   * The live keyring. Pass to `byokHeaders(keys)` when building the connection.
   * The UI never renders these; treat them as write-only from the UI's view.
   */
  keys: Keyring
  /** Set (or overwrite) a provider's key and persist it to the configured storage. */
  setKey: (provider: ProviderId, key: string) => Promise<void>
  /** Remove a single provider's key. */
  clearKey: (provider: ProviderId) => Promise<void>
  /** Remove every key. */
  clearAll: () => Promise<void>
  /**
   * Validate a key against the provider. Validates the given key, or the stored
   * key when omitted. Records the outcome in {@link status} and returns it;
   * never throws — a network/CORS failure is reported as an `error` status.
   */
  validateKey: (provider: ProviderId, key?: string) => Promise<KeyStatus>
  /** Per-provider status map. Providers with no key report `{ state: 'empty' }`. */
  status: Record<ProviderId, KeyStatus>
  /** The configured persistence storage. */
  storage: KeyringStorage
  hasKey: (provider: ProviderId) => boolean
}

export const ByokContext = createContext<ByokContextValue | null>(null)

export interface ByokProviderProps {
  children: ReactNode
  /**
   * Where keys are persisted. Defaults to the safest option
   * ({@link memoryStorage}) — keys vanish on refresh and nothing is persisted.
   * Fixed for the life of the provider.
   */
  storage?: KeyringStorage
}

export function ByokProvider({
  children,
  storage: initialStorage,
}: ByokProviderProps) {
  // Storage is chosen once and fixed for the life of the provider.
  const [storage] = useState<KeyringStorage>(
    () => initialStorage ?? memoryStorage(),
  )
  const [keys, setKeys] = useState<Keyring>({})
  const [statuses, setStatuses] = useState<
    Partial<Record<ProviderId, KeyStatus>>
  >({})

  // Keep a ref to the current keys so the persisting callbacks read the latest
  // without re-creating on every keystroke.
  const keysRef = useRef(keys)
  keysRef.current = keys

  // Hydrate from storage on mount.
  useEffect(() => {
    let cancelled = false
    void Promise.resolve(storage.load()).then((loaded) => {
      if (cancelled) return
      const loadedStatuses = Object.fromEntries(
        Object.entries(loaded)
          .filter(([, key]) => Boolean(key))
          .map(([provider, key]) => [
            provider,
            { state: 'set', masked: maskKey(key) } satisfies KeyStatus,
          ]),
      )
      // Merge hydrated keys UNDER any edits the user made during the async
      // load, so an early setKey is never clobbered by late hydration.
      setKeys((current) => ({ ...loaded, ...current }))
      setStatuses((current) => ({ ...loadedStatuses, ...current }))
    })
    return () => {
      cancelled = true
    }
  }, [storage])

  const persist = useCallback(
    (next: Keyring) => Promise.resolve(storage.save(next)),
    [storage],
  )

  const setKey = useCallback(
    async (provider: ProviderId, key: string) => {
      const next = { ...keysRef.current, [provider]: key }
      setKeys(next)
      setStatuses((prev) => ({
        ...prev,
        [provider]: { state: 'set', masked: maskKey(key) },
      }))
      await persist(next)
    },
    [persist],
  )

  const clearKey = useCallback(
    async (provider: ProviderId) => {
      const next = { ...keysRef.current }
      delete next[provider]
      setKeys(next)
      setStatuses((prev) => ({ ...prev, [provider]: EMPTY }))
      await persist(next)
    },
    [persist],
  )

  const clearAll = useCallback(async () => {
    setKeys({})
    setStatuses({})
    await Promise.resolve(storage.clear())
  }, [storage])

  const validateKey = useCallback(
    async (provider: ProviderId, key?: string): Promise<KeyStatus> => {
      const target = key ?? keysRef.current[provider]
      if (!target) {
        setStatuses((prev) => ({ ...prev, [provider]: EMPTY }))
        return EMPTY
      }
      const masked = maskKey(target)
      setStatuses((prev) => ({
        ...prev,
        [provider]: { state: 'validating', masked },
      }))

      let result: KeyStatus
      try {
        const status = await pingProvider(provider, target)
        result = { state: status, masked }
      } catch (error) {
        result = {
          state: 'error',
          masked,
          message: error instanceof Error ? error.message : String(error),
        }
      }
      setStatuses((prev) => ({ ...prev, [provider]: result }))
      return result
    },
    [],
  )

  const status = useMemo(() => {
    const full = {} as Record<ProviderId, KeyStatus>
    for (const provider of PROVIDER_IDS) {
      full[provider] = statuses[provider] ?? EMPTY
    }
    return full
  }, [statuses])

  const value = useMemo<ByokContextValue>(
    () => ({
      keys,
      setKey,
      clearKey,
      clearAll,
      validateKey,
      status,
      storage,
      hasKey: (provider) => Boolean(keys[provider]),
    }),
    [keys, setKey, clearKey, clearAll, validateKey, status, storage],
  )

  return <ByokContext.Provider value={value}>{children}</ByokContext.Provider>
}
